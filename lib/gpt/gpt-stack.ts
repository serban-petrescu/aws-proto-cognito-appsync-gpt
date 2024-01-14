import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { join } from "path";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGateway } from "aws-cdk-lib/aws-route53-targets";

interface GptaStackProps extends StackProps {
  domainName: string;
  certificateArn: string;
  cognitoDomain: string;
  appsyncDomain: string;
}

export class GptStack extends Stack {
  constructor(scope: Construct, id: string, props: GptaStackProps) {
    super(scope, id, props);

    const handler = new NodejsFunction(this, "ProxyLambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: join(__dirname, "api-proxy.lambda.ts"),
      timeout: Duration.seconds(29),
      environment: {
        COGNITO_DOMAIN: props.cognitoDomain,
        APPSYNC_DOMAIN: props.appsyncDomain,
      },
    });

    const certificate = Certificate.fromCertificateArn(
      this,
      "Certificate",
      props.certificateArn
    );

    const api = new LambdaRestApi(this, "LambdaRestApi", {
      handler,
      domainName: {
        certificate,
        domainName: `qanda-gpt-api.${props.domainName}`,
      },
    });

    const hostedZone = HostedZone.fromLookup(this, "ApiHostedZone", {
      domainName: props.domainName,
    });
    new ARecord(this, "ApiARecord", {
      zone: hostedZone,
      recordName: "qanda-gpt-api",
      target: RecordTarget.fromAlias(new ApiGateway(api)),
    });
  }
}
