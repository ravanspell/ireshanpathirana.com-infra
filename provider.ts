import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import { Construct } from "constructs";

/**
 * Create AWS provider, the AWS provider connect to AWS to create
 * defined resources in main.ts
 * 
 * @param scope Construct
 * @returns AwsProvider
 */
const createAwsProvider = (scope: Construct) => {

    const secretKey = process.env.AWS_SECRET_KEY;
    const accessKey = process.env.AWS_ACCESS_KEY;
    const region = process.env.AWS_REGION;

    if (!secretKey) {
        throw new Error("AWS secret key not provided");
    }

    if (!accessKey) {
        throw new Error("AWS access key not provided");
    }

    return new AwsProvider(scope, 'aws-provider', {
        secretKey,
        accessKey,
        region,
    });
}

export default createAwsProvider;