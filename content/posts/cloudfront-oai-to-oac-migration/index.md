---
title: "Why Your CloudFront Suddenly Can't Read S3: The OAI and KMS Incompatibility Nobody Warns You About"
date: 2025-11-27T10:00:00-07:00
lastmod: 2025-11-27T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "After enabling Customer Managed Key encryption on S3 buckets, all four web applications went down with cryptic KMS errors. Turns out Origin Access Identity (OAI) - a decade-old AWS feature still used everywhere - simply doesn't work with SSE-KMS. Here's how we migrated to Origin Access Control (OAC) and what AWS doesn't tell you."

tags: ["AWS", "CloudFront", "S3", "KMS", "OAI", "OAC", "Terraform", "DevOps", "Security"]
categories: ["DevOps", "AWS"]

lightgallery: true

toc:
  auto: true

code:
  copy: true
  maxShownLines: 50

math:
  enable: false

mermaid: true
---

The goal: set up CMK encryption for our web apps S3 buckets. Simple, right? Not quite.

<!--more-->

We had proactively set up Trivy to scan our infrastructure-as-code, looking for security vulnerabilities before they became problems. One day, the scan results came back flagged in red: unencrypted S3 buckets. High severity. The fix seemed simple - add Customer Managed Keys (CMK) with `kms_master_key_id` to the S3 bucket configuration and call it a day. We deployed to production, and everything seemed fine. The apps kept running. Crisis averted, right?

Not quite. Hours later, after a routine frontend deployment, four production web applications went completely dark, returning nothing but XML error pages.

But here's the silver lining: **our uptime monitoring caught it immediately**. No waiting for customer reports, no delayed response. Alarms fired the instant the deployment finished. And with AI assistance, we identified the root cause and the fix within minutes—not hours of debugging through AWS documentation.

## The Setup: A Legacy CloudFront Configuration

Our infrastructure had been running for years with this pattern:

```hcl
# The classic CloudFront + S3 setup everyone uses
resource "aws_cloudfront_origin_access_identity" "webapp_oai" {
  comment = "Web app origin access identity"
}

resource "aws_s3_bucket_policy" "webapp_s3_policy" {
  bucket = aws_s3_bucket.webapp_s3.id
  policy = jsonencode({
    Statement = [{
      Effect = "Allow"
      Principal = {
        AWS = aws_cloudfront_origin_access_identity.webapp_oai.iam_arn
      }
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.webapp_s3.arn}/*"
    }]
  })
}

resource "aws_cloudfront_distribution" "webapp" {
  origin {
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.webapp_oai.cloudfront_access_identity_path
    }
  }
  # ... rest of distribution config
}
```

This is Origin Access Identity (OAI) - introduced by AWS in 2008 and still the default in countless tutorials, StackOverflow answers, and Terraform examples. It works great... until you add encryption.

## The Change That Seemed Safe

Following security best practices, we enabled CMK encryption:

```hcl
resource "aws_s3_bucket_server_side_encryption_configuration" "webapp_s3_sse" {
  bucket = aws_s3_bucket.webapp_s3.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.s3_web_applications_kms_key.key_arn
    }
  }
}
```

Deploy to dev. Trivy goes green. Deploy to production. Apps still loading. Security team happy. Time to celebrate?

Not quite.

## The Deployment That Broke Everything

Hours later, we deployed a routine frontend update. The CI/CD pipeline built the new assets and synced them to S3. **That's when everything broke.**

The new objects were encrypted with our CMK (as configured). But here's the critical detail: **S3 encryption settings only apply to new objects**. The existing files were still encrypted with SSE-S3 (the default), and CloudFront could read them just fine using OAI.

But the moment we uploaded new files encrypted with KMS, our alarms fired. The sites went dark. Within seconds, users started reporting blank pages. Monitoring dashboards lit up red. Someone navigated directly to the production URL and saw this:

```xml
<Error>
  <Code>KMS.UnrecognizedClientException</Code>
  <Message>No account found for the given parameters</Message>
  <RequestId>88ZKZNYS2N8YYA0D</RequestId>
</Error>
```

## The Investigation

This is where AI saved us hours of debugging. Instead of spending the afternoon diving through AWS documentation and CloudTrail logs, we used AI to quickly explore the problem space.

### Phase 1: The Obvious Suspects

First instinct - we probably forgot to add KMS permissions somewhere. Let's check:

```bash
# Check KMS key policy
aws kms get-key-policy --key-id <key-id> --policy-name default

# Result: S3 service principal has access ✅
# Result: OAI ARN has decrypt permissions ✅
```

Everything looked correct. S3 could encrypt, OAI could decrypt. So why the error?

### Phase 2: Understanding the Error

`KMS.UnrecognizedClientException` is a strange error. It doesn't say "Access Denied" - it says the **account wasn't recognized**. That's not a permissions issue; that's an identity issue.

Let's trace the request flow:

1. User requests `https://app.example.com/index.html`
2. CloudFront receives request
3. CloudFront authenticates to S3 using OAI
4. S3 receives request, sees object is encrypted
5. S3 calls KMS to decrypt the object
6. KMS receives request from... who?

That's the problem. When S3 calls KMS, it needs to pass along the caller's identity. But OAI uses a legacy authentication mechanism that doesn't properly propagate the principal context to KMS.

### Phase 3: AI-Assisted Documentation Deep Dive

Instead of manually searching through hundreds of pages of AWS documentation, we asked AI about the error. Within minutes, it surfaced the critical information buried in the AWS CloudFront documentation:

> "If your S3 bucket uses server-side encryption with AWS KMS keys (SSE-KMS), you must use origin access control (OAC). OAI doesn't work with SSE-KMS."

One sentence. Buried in a migration guide. No warning in the S3 encryption docs. No validation error in Terraform. This would have taken us hours to find manually. AI found it in minutes.

### Phase 4: Confirming the Root Cause

The smoking gun was in CloudTrail:

```json
{
  "eventName": "Decrypt",
  "errorCode": "AccessDenied",
  "errorMessage": "User: anonymous is not authorized to perform: kms:Decrypt",
  "userIdentity": {
    "type": "Unknown",
    "invokedBy": "s3.amazonaws.com"
  }
}
```

"User: anonymous" - that's the problem. The OAI identity isn't being recognized by KMS at all. It's showing up as anonymous because OAI uses a pre-IAM authentication mechanism that KMS simply doesn't understand.

## The Root Cause: A 15-Year-Old Feature

Origin Access Identity was designed in 2008, before KMS existed (KMS launched in 2014). OAI uses a special CloudFront-specific authentication mechanism that:

1. Creates a virtual IAM-like principal
2. S3 recognizes this principal through special handling
3. But KMS has no such special handling

When S3 needs to decrypt an object, it calls KMS with the requester's identity. With OAI, that identity doesn't translate properly - KMS sees an unrecognized principal and rejects it.

**This isn't a configuration issue. It's an architectural incompatibility.**

AWS introduced Origin Access Control (OAC) in 2022 specifically to address this limitation. OAC uses modern SigV4 signing and properly integrates with IAM and KMS. But they never deprecated OAI, never added warnings, and the old documentation and tutorials still recommend it.

## The Solution: Migrate to Origin Access Control (OAC)

### Step 1: Create the Origin Access Control

```hcl
resource "aws_cloudfront_origin_access_control" "webapp_oac" {
  name                              = "webapp-oac-${var.environment}"
  description                       = "Web app Origin Access Control - ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"  # Modern authentication!
}
```

Key differences from OAI:
- `signing_protocol = "sigv4"` - Uses AWS Signature Version 4
- `signing_behavior = "always"` - Signs every request
- Properly integrates with IAM and KMS

### Step 2: Update the CloudFront Distribution

```hcl
resource "aws_cloudfront_distribution" "webapp" {
  origin {
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    # OLD - Remove this block:
    # s3_origin_config {
    #   origin_access_identity = aws_cloudfront_origin_access_identity.webapp_oai.cloudfront_access_identity_path
    # }

    # NEW - Add this instead:
    origin_access_control_id = aws_cloudfront_origin_access_control.webapp_oac.id
  }
  # ... rest of distribution config
}
```

Note: You can't use both `s3_origin_config` and `origin_access_control_id` - they're mutually exclusive.

### Step 3: Update the S3 Bucket Policy

This is the most significant change. OAC uses the CloudFront **service principal** instead of an IAM ARN:

```hcl
data "aws_iam_policy_document" "webapp_s3_policy_data" {
  statement {
    effect = "Allow"
    actions = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.webapp_s3.arn}/*"]
    
    # OLD - OAI uses IAM ARN:
    # principals {
    #   type        = "AWS"
    #   identifiers = [aws_cloudfront_origin_access_identity.webapp_oai.iam_arn]
    # }

    # NEW - OAC uses service principal with condition:
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.webapp.arn]
    }
  }
}
```

The condition is crucial - it ensures only YOUR CloudFront distribution can access the bucket, not any CloudFront distribution.

### Step 4: Update the KMS Key Policy

Add the CloudFront service principal to your KMS key:

```hcl
module "s3_web_applications_kms_key" {
  source = "./modules/kms"

  services = [
    {
      name    = "s3.amazonaws.com"
      actions = ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"]
    },
    {
      # CloudFront service principal for OAC
      name = "cloudfront.amazonaws.com"
      actions = ["kms:Decrypt", "kms:DescribeKey"]
    }
  ]
}
```

Note: CloudFront only needs `Decrypt` - it never encrypts objects.

## The Message Flow

### Before: OAI (Broken with KMS)

{{< mermaid >}}
sequenceDiagram
    participant User
    participant CloudFront
    participant S3
    participant KMS
    
    User->>CloudFront: GET /index.html
    CloudFront->>S3: GetObject (OAI credentials)
    S3->>KMS: Decrypt (principal: ???)
    Note over KMS: OAI identity not recognized
    KMS-->>S3: UnrecognizedClientException ❌
    S3-->>CloudFront: Error
    CloudFront-->>User: XML Error Page
{{< /mermaid >}}

### After: OAC (Works with KMS)

{{< mermaid >}}
sequenceDiagram
    participant User
    participant CloudFront
    participant S3
    participant KMS
    
    User->>CloudFront: GET /index.html
    CloudFront->>S3: GetObject (SigV4 signed)
    S3->>KMS: Decrypt (principal: cloudfront.amazonaws.com)
    Note over KMS: Service principal recognized ✅
    KMS-->>S3: Decryption key
    S3-->>CloudFront: Decrypted object
    CloudFront-->>User: index.html content
{{< /mermaid >}}

## Testing and Verification

After deploying the OAC migration:

```bash
# 1. Verify the distribution is using OAC
aws cloudfront get-distribution --id <dist-id> \
  --query "Distribution.DistributionConfig.Origins.Items[0].OriginAccessControlId"

# 2. Check S3 bucket policy has correct principal
aws s3api get-bucket-policy --bucket <bucket-name> | jq '.Policy | fromjson'

# 3. Verify KMS key policy includes cloudfront.amazonaws.com
aws kms get-key-policy --key-id <key-id> --policy-name default

# 4. Test access (should return 200, not XML error)
curl -I https://your-app.example.com/

# 5. Check CloudTrail for successful KMS decrypt
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Decrypt \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
```

**Success criteria:**
- Website loads without XML errors
- CloudTrail shows successful `Decrypt` events
- KMS metrics show no `AccessDenied` errors
- S3 access logs show `200` responses

## The Full Terraform Solution

Here's the complete migration pattern for one web application:

```hcl
#######################################
# Origin Access Control (OAC) - NEW
#######################################

resource "aws_cloudfront_origin_access_control" "webapp_oac" {
  name                              = "${var.project}-webapp-oac-${var.environment}"
  description                       = "Web app Origin Access Control - ${var.environment}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

#######################################
# Origin Access Identity (OAI) - DEPRECATED
# Keep temporarily for rollback capability
#######################################

resource "aws_cloudfront_origin_access_identity" "webapp_oai" {
  comment = "DEPRECATED - Web app OAI - ${var.environment}"
}

#######################################
# S3 Bucket Policy - Updated for OAC
#######################################

data "aws_iam_policy_document" "webapp_s3_policy" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.webapp_s3.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.webapp.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "webapp_s3_policy" {
  bucket = aws_s3_bucket.webapp_s3.id
  policy = data.aws_iam_policy_document.webapp_s3_policy.json
}

#######################################
# CloudFront Distribution - Using OAC
#######################################

resource "aws_cloudfront_distribution" "webapp" {
  enabled         = true
  is_ipv6_enabled = true

  origin {
    origin_id   = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    domain_name = aws_s3_bucket.webapp_s3.bucket_regional_domain_name

    # OAC instead of s3_origin_config
    origin_access_control_id = aws_cloudfront_origin_access_control.webapp_oac.id
  }

  default_cache_behavior {
    target_origin_id       = aws_s3_bucket.webapp_s3.bucket_regional_domain_name
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  # ... rest of your distribution config
}

#######################################
# KMS Key - With CloudFront Service Principal
#######################################

module "s3_web_applications_kms_key" {
  source = "./modules/kms"

  alias_name  = "/alias/${var.project}/s3/web-applications/${var.environment}"
  description = "KMS key for S3 web application buckets"

  services = [
    {
      name    = "s3.amazonaws.com"
      actions = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
    },
    {
      name    = "cloudfront.amazonaws.com"
      actions = ["kms:Decrypt", "kms:DescribeKey"]
    }
  ]
}
```

## Key Takeaways

1. **S3 encryption settings only affect new objects:**
   - Changing bucket encryption doesn't re-encrypt existing files
   - This is why our apps kept working after enabling CMK
   - Only new uploads triggered the OAI/KMS incompatibility
   - Always test with actual deployments, not just infrastructure changes

2. **AI dramatically accelerates incident response:**
   - What could have been hours of debugging took minutes
   - AI quickly surfaced the OAI/SSE-KMS incompatibility
   - Immediate access to relevant documentation and solutions
   - Production downtime measured in minutes, not hours

3. **OAI and SSE-KMS are fundamentally incompatible:**
   - Not a permissions issue - architectural limitation
   - OAI predates KMS by 6 years
   - No amount of KMS policy changes will fix it
   - AWS won't warn you about this

4. **OAC is the modern replacement:**
   - Uses SigV4 signing (proper IAM integration)
   - Works with SSE-KMS, SSE-S3, and SSE-C
   - AWS recommended since 2022
   - Better security (condition-based access)

5. **The S3 bucket policy changes significantly:**
   - OAI: IAM ARN principal
   - OAC: Service principal + condition
   - The condition prevents other CloudFront distributions from accessing your bucket

6. **KMS key policy needs the CloudFront service principal:**
   - Add `cloudfront.amazonaws.com` with decrypt permissions
   - This enables the SigV4 authentication to work with KMS

7. **Keep OAI resources during migration:**
   - Don't delete immediately
   - Useful for rollback if issues arise
   - Remove in follow-up PR after validation

8. **Test with actual deployments, not just infrastructure:**
   - Infrastructure changes without new objects won't trigger the issue
   - Deploy your application to staging after encryption changes
   - Verify that newly uploaded files can be served correctly
   - This would have caught our issue before production

## Migration Checklist

If you're migrating from OAI to OAC:

**Pre-Migration:**
- [ ] Identify all CloudFront distributions using OAI
- [ ] Identify all S3 buckets with SSE-KMS encryption
- [ ] Review KMS key policies
- [ ] Plan maintenance window (if production)

**Infrastructure Changes:**
- [ ] Create `aws_cloudfront_origin_access_control` resource
- [ ] Update CloudFront origin to use `origin_access_control_id`
- [ ] Remove `s3_origin_config` block
- [ ] Update S3 bucket policy to use service principal
- [ ] Add `AWS:SourceArn` condition to bucket policy
- [ ] Add `cloudfront.amazonaws.com` to KMS key policy
- [ ] Keep OAI resource (marked deprecated)

**Testing:**
- [ ] Deploy to non-production environment
- [ ] Verify website loads without errors
- [ ] Check CloudTrail for successful KMS operations
- [ ] Monitor CloudWatch for errors
- [ ] Validate cache behavior still works
- [ ] Test cache invalidation
- [ ] Verify custom error pages work

**Post-Migration:**
- [ ] Monitor production for 24-48 hours
- [ ] Remove deprecated OAI resources (separate PR)
- [ ] Update documentation
- [ ] Share learnings with team

## Why AWS Doesn't Warn You

This is the frustrating part. AWS could:

1. Add a validation error in CloudFront when OAI + SSE-KMS is configured
2. Update Terraform AWS provider to warn about this combination
3. Add prominent warnings in S3 encryption documentation
4. Deprecate OAI entirely (it's 15+ years old)

But they haven't. The only mention is buried in migration guides that assume you're already looking to migrate. If you're setting up new infrastructure following old tutorials, you'll hit this wall.

## References

- [AWS CloudFront OAC Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [Migrating from OAI to OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#migrate-from-oai-to-oac)
- [S3 SSE-KMS Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [Terraform aws_cloudfront_origin_access_control](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control)
- [AWS Blog: OAC Announcement (August 2022)](https://aws.amazon.com/blogs/networking-and-content-delivery/amazon-cloudfront-introduces-origin-access-control-oac/)

## Wrapping Up

Yes, we caused a production outage. But it lasted minutes, not hours. Why? Because AI helped us diagnose the issue almost immediately, and we knew exactly what we needed to fix.

This migration took our four web applications from broken to fully functional - while achieving the security posture we were aiming for. The payoff? **Zero critical or high severity vulnerabilities detected by Trivy in our infrastructure-as-code**. And we gained world-class encryption with Customer Managed Keys in the process.

### The Critical Lessons

1. **S3 encryption settings only apply to new objects.** Existing objects keep their original encryption. This is why our apps kept working after enabling CMK - until we deployed new files. If we had deployed to staging after changing the encryption mechanism, we would have caught this before production.

2. **AI accelerated our debugging from hours to minutes.** Instead of manually searching through documentation and CloudTrail logs, AI surfaced the OAI/OAC incompatibility immediately. This is the power of AI-assisted DevOps.

3. **When AWS introduces a new feature to replace a legacy one and doesn't deprecate the old one, be suspicious.** In this case, OAC (2022) replaced OAI (2008) specifically for KMS compatibility - a detail that's poorly documented.

If you're running CloudFront + S3 with OAI and planning to enable CMK encryption, hopefully this post helps you avoid the same outage. The sequence matters: migrate to OAC first, then enable encryption. And always test with actual deployments in staging, not just infrastructure changes.

---

*Found this helpful? Hit me up on [LinkedIn](https://linkedin.com/in/carimfadil).*

