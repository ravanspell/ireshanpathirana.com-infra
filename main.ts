import { Construct } from "constructs";
import { App, TerraformStack, S3Backend, } from "cdktf";
import { S3Bucket } from "@cdktf/provider-aws/lib/s3-bucket";
import { CloudfrontDistribution } from "@cdktf/provider-aws/lib/cloudfront-distribution";
import { CloudfrontOriginAccessControl } from "@cdktf/provider-aws/lib/cloudfront-origin-access-control";
import { S3BucketPolicy } from "@cdktf/provider-aws/lib/s3-bucket-policy";
import { createAwsProvider } from "./provider";

class MyPortfolioWebSiteTerraformStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const tagPrefix = "ireshan-portfolio-infra";
    const s3OriginId = `${tagPrefix}-s3-origin`;

    const environment = process.env.ENVIRONMENT as string;
    const acmCertArn = process.env.ACM_CERT_ARN as string;

    const mainCustomDomain = process.env.WEB_SITE_CUSTOM_DOMAIN as string;
    const mainWwwCustomDomain = process.env.WEB_SITE_CUSTOM_DOMAIN_WWW as string;


    if (!acmCertArn) {
      throw new Error("ACM_CERT_ARN must be set in environment variables");
    }

    // Initialize AWS provider
    createAwsProvider(this);

    /**
     * thew Backend <- holds terraform state
     * the place where track the resources has been created
     */
    new S3Backend(scope, {
      bucket: process.env.REMOTE_STATE_S3_BUCKET_NAME as string,
      key: "terraform.tfstate",
      encrypt: true
    });

    /**
     * This bucket stores static site assets (HTML, JS, CSS, images)
     * It's private because CloudFront OAC will handle secure access.
     */
    const bucket = new S3Bucket(scope, 'ireshanpathirana-website-s3', {
      bucket: process.env.WEB_SITE_CUSTOM_DOMAIN as string, // bucket name should be same as website domain
      acl: 'private',
      versioning: { enabled: false },
      corsRule: [
        {
          allowedMethods: ['GET'],
          allowedOrigins: [
            mainCustomDomain,
            mainWwwCustomDomain
          ],
        }
      ],
      website: {
        indexDocument: 'index.html',
        errorDocument: 'index.html' // SPA fallback for 404
      },
      tags: {
        env: environment,
        resourceTag: `${tagPrefix}-s3`
      }
    });

    /**
     * OAC securely allows CloudFront to access the private S3 bucket.
     * This is the modern replacement for the older Origin Access Identity (OAI).
     */
    const cloudFrontOac = new CloudfrontOriginAccessControl(scope, 'ireshanpathirana-website-cloudfront-oac', {
      name: 'reshanpathirana-static-site-oac',
      originAccessControlOriginType: 's3',
      signingBehavior: 'always',
      signingProtocol: 'sigv4',
    });

    /**
     * Serves the S3 bucket content globally with HTTPS and caching.
     */
    const cloudfront = new CloudfrontDistribution(scope, 'ireshanpathirana-website-cloudfront-dist', {
      enabled: true,
      origin: [{
        domainName: bucket.bucketRegionalDomainName,
        originId: s3OriginId,                           // unique identifier for this origin
        originAccessControlId: cloudFrontOac.id,
      }],
      defaultCacheBehavior: {
        targetOriginId: s3OriginId,
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD", "OPTIONS"],
        compress: true,                                 // enable gzip/brotli
        viewerProtocolPolicy: 'redirect-to-https'       // force HTTPS
      },
      defaultRootObject: "index.html",                  // default file for root path
      restrictions: {
        geoRestriction: { restrictionType: "none" }
      },
      viewerCertificate: {
        acmCertificateArn: acmCertArn,
        sslSupportMethod: "sni-only"                   // standard SSL config
      },
      aliases: [                                       // custom domains for this distribution
        mainCustomDomain,
        mainWwwCustomDomain
      ],
      tags: {
        env: environment,
        resourceTag: `${tagPrefix}-cloud-front`
      }
    });

    /**
     * Grants CloudFront OAC permission to read objects in the private S3 bucket.
     * Without this, CloudFront cannot fetch content.
     */
    new S3BucketPolicy(scope, 'ireshanpathirana-website-s3-bucket-policy', {
      bucket: bucket.bucket,
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: "cloudfront.amazonaws.com"
            },
            Action: "s3:GetObject",
            Resource: `${bucket.arn}/*`,
            Condition: {
              StringEquals: {
                "AWS:SourceArn": cloudfront.arn
              }
            }
          }
        ]
      })
    })
  }
}

const app = new App();
new MyPortfolioWebSiteTerraformStack(app, "my-portfolio-infra");
app.synth();
