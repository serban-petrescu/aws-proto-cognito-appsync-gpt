import { Fn, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  Definition,
  GraphqlApi,
  SchemaFile,
} from "aws-cdk-lib/aws-appsync";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  CfnUserPoolGroup,
  OAuthScope,
  UserPool,
} from "aws-cdk-lib/aws-cognito";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { CnameRecord, HostedZone } from "aws-cdk-lib/aws-route53";
import { Trigger } from "aws-cdk-lib/triggers";
import { Construct } from "constructs";
import { join } from "path";

interface QandaStackProps extends StackProps {
  domainName: string;
  certificateArn: string;
  callbackUrls: string[];
}

export class QandaStack extends Stack {
  constructor(scope: Construct, id: string, private props: QandaStackProps) {
    super(scope, id, props);

    const table = this.createDatabaseTable();
    const userPool = this.createUserPool();

    this.createApi(table, userPool);
    this.createSeed(table, userPool);
  }

  private createSeed(table: Table, userPool: UserPool): void {
    const seedDataFunction = new NodejsFunction(this, "SeedDataFunction", {
      runtime: Runtime.NODEJS_18_X,
      entry: join(__dirname, "seed.lambda.ts"),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        DYNAMODB_TABLE: table.tableName,
      },
    });

    table.grantWriteData(seedDataFunction);
    userPool.grant(
      seedDataFunction,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminSetUserPassword",
      "cognito-idp:AdminAddUserToGroup"
    );

    new Trigger(this, "TriggerSeed", {
      handler: seedDataFunction,
      executeOnHandlerChange: false,
    });
  }

  private createDatabaseTable(): Table {
    return new Table(this, "DatabaseTable", {
      partitionKey: {
        name: "pk",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "sk",
        type: AttributeType.STRING,
      },
    });
  }

  private createUserPool(): UserPool {
    const userPool = new UserPool(this, "UserPool", {
      userPoolName: "QandAUserPool",
      selfSignUpEnabled: true
    });

    const domain = userPool.addDomain("CognitoDomain", {
      customDomain: {
        domainName: `qanda-auth.${this.props.domainName}`,
        certificate: Certificate.fromCertificateArn(
          this,
          "CognitoCertificate",
          this.props.certificateArn
        ),
      },
    });

    const hostedZone = HostedZone.fromLookup(this, "CognitoHostedZone", {
      domainName: this.props.domainName,
    });
    new CnameRecord(this, "CognitoCnameRecord", {
      zone: hostedZone,
      recordName: "qanda-auth",
      domainName: domain.cloudFrontDomainName,
    });

    userPool.addClient("AppClient", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: true,
      oAuth: {
        flows: {
          implicitCodeGrant: true,
          authorizationCodeGrant: true,
        },
        scopes: [OAuthScope.EMAIL],
        callbackUrls: this.props.callbackUrls,
      },
    });

    userPool.addClient("WebAppClient", {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false
    });

    new CfnUserPoolGroup(this, "ReadersGroup", {
      groupName: "Readers",
      userPoolId: userPool.userPoolId,
    });

    new CfnUserPoolGroup(this, "PostersGroup", {
      groupName: "Posters",
      userPoolId: userPool.userPoolId,
    });

    new CfnUserPoolGroup(this, "ModeratorsGroup", {
      groupName: "Moderators",
      userPoolId: userPool.userPoolId,
    });

    return userPool;
  }

  private createApi(table: Table, userPool: UserPool): void {
    const lambda = new NodejsFunction(this, "GqlHandler", {
      runtime: Runtime.NODEJS_18_X,
      entry: join(__dirname, "gql-handler.lambda.ts"),
    });
    lambda.addEnvironment("DYNAMODB_TABLE", table.tableName);
    table.grantReadWriteData(lambda);

    const api = new GraphqlApi(this, "Api", {
      name: "qanda-api",
      definition: Definition.fromSchema(
        SchemaFile.fromAsset(join(__dirname, "schema.graphql"))
      ),
      domainName: {
        domainName: `qanda-api.${this.props.domainName}`,
        certificate: Certificate.fromCertificateArn(
          this,
          "AppSyncCertificate",
          this.props.certificateArn
        ),
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
          },
        },
      },
    });

    const hostedZone = HostedZone.fromLookup(this, "AppSyncHostedZone", {
      domainName: this.props.domainName,
    });
    new CnameRecord(this, "AppSyncCnameRecord", {
      zone: hostedZone,
      recordName: "qanda-api",
      domainName: Fn.select(2, Fn.split('/', api.graphqlUrl)),
    });

    const dataSource = api.addLambdaDataSource("lambda", lambda);
    dataSource.createResolver("ResolverListQuestions", {
      typeName: "Query",
      fieldName: "listQuestions",
    });
    dataSource.createResolver("ResolverPostQuestion", {
      typeName: "Mutation",
      fieldName: "postQuestion",
    });
    dataSource.createResolver("ResolverPostAnswer", {
      typeName: "Mutation",
      fieldName: "postAnswer",
    });
    dataSource.createResolver("ResolverDeleteQuestion", {
      typeName: "Mutation",
      fieldName: "deleteQuestion",
    });
  }
}
