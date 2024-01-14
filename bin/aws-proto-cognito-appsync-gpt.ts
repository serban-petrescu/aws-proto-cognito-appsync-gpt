#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { QandaStack } from "../lib/qanda/qanda-stack";
import { config } from "dotenv";
import { GptStack } from "../lib/gpt/gpt-stack";

config();

const app = new cdk.App();
new QandaStack(app, "QAndAStack", {
  domainName: process.env.QANDA_DOMAIN_NAME!,
  certificateArn: process.env.QANDA_GLOBAL_CERTIFICATE_ARN!,
  callbackUrls: process.env.QANDA_CALLBACK_URLS!.split(","),
  env: {
    account: process.env.AWS_ACCOUNT_ID!,
    region: process.env.AWS_REGION!,
  },
});

new GptStack(app, "QAndAGptStack", {
  domainName: process.env.QANDA_DOMAIN_NAME!,
  certificateArn: process.env.QANDA_REGIONAL_CERTIFICATE_ARN!,
  cognitoDomain: `qanda-auth.${process.env.QANDA_DOMAIN_NAME!}`,
  appsyncDomain: `qanda-api.${process.env.QANDA_DOMAIN_NAME!}`,
  env: {
    account: process.env.AWS_ACCOUNT_ID!,
    region: process.env.AWS_REGION!,
  },
});
