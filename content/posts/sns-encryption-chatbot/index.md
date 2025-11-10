---
title: "When Encryption Breaks Your Slack Notifications: A Tale of KMS, SNS, and AWS Chatbot"
date: 2025-11-10T10:00:00-07:00
lastmod: 2025-11-10T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "Added KMS encryption to SNS topics for security compliance, caught a breaking issue in dev before production. Turns out AWS Chatbot needs THREE different service principals in your KMS policy."

tags: ["AWS", "SNS", "KMS", "ChatBot", "Terraform", "DevOps", "Security"]
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

It started innocently enough - a Trivy security scan flagged 9 high-severity vulnerabilities in our Terraform configuration. The issue? Unencrypted SNS topics. The fix seemed straightforward: add a KMS key, encrypt the topics, deploy to dev for validation. What could go wrong?

<!--more-->

## The Setup

```hcl
# Before: Unencrypted SNS topic
resource "aws_sns_topic" "application_alarms" {
  name = "application-alarms-${var.environment}"
  # No encryption - Trivy security vulnerability
}

# After: Encrypted SNS topic
resource "aws_sns_topic" "application_alarms" {
  name              = "application-alarms-${var.environment}"
  kms_master_key_id = module.sns_kms.key_arn  # ✅ Encrypted!
}
```

The PR passed code review, tests passed, and we deployed to the development environment. The Trivy scan went green. Victory!

But before promoting to production, I wanted to validate the change properly. Good thing I did - after waiting a day to observe the dev environment, I noticed something concerning: no CloudWatch alarm notifications were appearing in our Slack channel. The infrastructure looked fine, but the silence was suspicious.

## The Investigation

### Phase 1: Everything Looks Fine

Initial checks showed no obvious issues:

- ✅ CloudWatch alarms were triggering
- ✅ SNS topics existed and were properly configured
- ✅ AWS Chatbot was connected to our Slack workspace
- ✅ SNS subscriptions were active

But notifications weren't reaching Slack. Time to dig deeper.

### Phase 2: The SNS Metrics

Checking SNS metrics revealed something interesting:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SNS \
  --metric-name NumberOfNotificationsDelivered \
  --dimensions Name=TopicName,Value=application-alarms-dev \
  --statistics Sum
```

**Result:** 0 deliveries when CloudWatch alarms triggered. But when we manually published a test message:

```bash
aws sns publish \
  --topic-arn arn:aws:sns:us-west-2:123456789:application-alarms-dev \
  --message "Test message"
```

**Result:** Message delivered successfully! SNS metrics showed 1 successful delivery.

So SNS could deliver messages, but CloudWatch alarms couldn't reach SNS. The plot thickens.

### Phase 3: CloudWatch Logs Tell the Truth

We enabled CloudWatch Logs for AWS Chatbot and triggered another test:

```json
{
  "message": "Event received is not supported",
  "eventType": "CloudWatchAlarm"
}
```

Wait, Chatbot was receiving messages but rejecting them? Let's try triggering the actual CloudWatch alarm:

**Result:** No logs at all. The messages never reached Chatbot.

This narrowed it down: CloudWatch couldn't publish to the encrypted SNS topic.

## The Root Cause: Three Missing Permissions

The issue wasn't just one missing permission - it was **three** separate problems:

### Problem 1: CloudWatch Can't Publish to Encrypted SNS

When you encrypt an SNS topic with KMS, CloudWatch Alarms needs explicit permission to use that key. This is documented, but easy to miss:

```hcl
# What we had (wrong):
services = [{
  name = "sns.amazonaws.com"
  actions = ["kms:Decrypt", "kms:GenerateDataKey"]
}]

# What we needed:
services = [
  {
    name = "sns.amazonaws.com"
    actions = ["kms:Decrypt", "kms:GenerateDataKey"]
  },
  {
    name = "cloudwatch.amazonaws.com"  # ← Missing!
    actions = ["kms:Decrypt", "kms:GenerateDataKey"]
  }
]
```

**Why?** CloudWatch encrypts alarm data before sending it to SNS. Without KMS permissions, it can't encrypt, so it can't publish.

### Problem 2: AWS Chatbot Uses Two Different Roles

This one caught us off guard. AWS Chatbot actually uses **two separate IAM roles**:

1. **Channel Role** - Configured in the Chatbot console
   - Used for: Querying CloudWatch, describing resources
   - Example: `aws-chatbot-notifications-{env}`

2. **Service-Linked Role** - Auto-created by AWS
   - Used for: SNS subscription and message decryption
   - Always: `AWSServiceRoleForAWSChatbot`

We had granted KMS permissions to the channel role, but SNS subscriptions use the service-linked role!

```bash
# Check who's actually subscribed:
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-west-2:123456789:application-alarms-dev

# Result:
{
  "SubscriptionArn": "...",
  "Principal": "arn:aws:iam::123456789:role/aws-service-role/management.chatbot.amazonaws.com/AWSServiceRoleForAWSChatbot"
}
```

Not the role we granted permissions to!

### Problem 3: Over-Privileged Permissions

While fixing the first two issues, we noticed we'd granted `kms:GenerateDataKey` to both Chatbot roles. But Chatbot only decrypts messages - it never encrypts anything. This violates the principle of least privilege.

## The Solution

### Step 1: Create the KMS Key Policy

```hcl
module "sns_kms" {
  source = "./modules/kms"

  alias_name  = "/alias/${var.project}/sns/${var.environment}"
  description = "KMS Key used to encrypt/decrypt SNS topics"
  
  # Service principals that can use this key
  services = [
    {
      # SNS needs to encrypt messages at rest
      name = "sns.amazonaws.com"
      actions = ["kms:Decrypt", "kms:GenerateDataKey"]
    },
    {
      # CloudWatch needs to encrypt alarm messages
      name = "cloudwatch.amazonaws.com"
      actions = ["kms:Decrypt", "kms:GenerateDataKey"]
    }
  ]

  # AWS principals (IAM roles) that can use this key
  additional_principals = [{
    type = "AWS"
    identifiers = [
      # Chatbot channel role (for CloudWatch queries)
      aws_iam_role.chatbot_notifications.arn,
      # Chatbot service-linked role (for SNS subscriptions)
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/management.chatbot.amazonaws.com/AWSServiceRoleForAWSChatbot"
    ]
    actions = [
      "kms:Decrypt",      # Required
      "kms:DescribeKey"   # Optional but useful
      # NOT kms:GenerateDataKey - Chatbot doesn't encrypt!
    ]
  }]
}
```

### Step 2: Create the Chatbot IAM Role in Terraform

Previously, we'd created this manually in the console. Time to codify it:

```hcl
resource "aws_iam_role" "chatbot_notifications" {
  name               = "aws-chatbot-notifications-${var.environment}"
  assume_role_policy = data.aws_iam_policy_document.chatbot_assume_role.json
}

data "aws_iam_policy_document" "chatbot_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["chatbot.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

# CloudWatch read-only access
resource "aws_iam_role_policy" "chatbot_cloudwatch_readonly" {
  name   = "CloudWatchReadOnlyAccess"
  role   = aws_iam_role.chatbot_notifications.id
  policy = data.aws_iam_policy_document.chatbot_cloudwatch_readonly.json
}

# KMS decrypt for SNS messages
resource "aws_iam_role_policy" "chatbot_kms_decrypt" {
  name   = "SNSKMSDecryptAccess"
  role   = aws_iam_role.chatbot_notifications.id
  policy = data.aws_iam_policy_document.chatbot_kms_decrypt.json
}

data "aws_iam_policy_document" "chatbot_kms_decrypt" {
  statement {
    sid    = "AllowDecryptSNSMessages"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey"
    ]
    resources = [module.sns_kms.key_arn]
  }
}
```

### Step 3: Manual Configuration (The Catch)

Here's where it gets frustrating - **AWS Chatbot configurations can't be managed by Terraform** (as of late 2024). You have to manually update them in the console:

1. Navigate to AWS Chatbot → Slack → Your Workspace
2. Click on your channel configuration
3. Update the IAM Role to use the Terraform-managed role
4. **Critical:** Make sure the AWS Chatbot Slack app is installed in your workspace
5. **Critical:** Add the `@AWS Chatbot` bot to your Slack channel

Missing step 4 or 5? Silent failures. No errors, no logs, just... nothing.

## The Message Flow

When everything is configured correctly:

{{< mermaid >}}
graph TB
    A[CloudWatch Alarm] -->|kms:GenerateDataKey| B[KMS Key]
    B --> C[Encrypted Message]
    C --> D[SNS Topic<br/>encrypted at rest]
    D --> E[SNS delivers to subscriber]
    E --> F[AWSServiceRoleForAWSChatbot]
    F -->|kms:Decrypt| B
    B --> G[Decrypted Message]
    G --> H[AWS Chatbot Channel<br/>aws-chatbot-notifications-env]
    H --> I[Slack Channel]

    style B fill:#FFD700,stroke:#FF8C00,color:#000
    style D fill:#90EE90,stroke:#2d5016,color:#000
    style F fill:#87CEEB,stroke:#4682B4,color:#000
    style H fill:#87CEEB,stroke:#4682B4,color:#000
    style I fill:#E01E5A,stroke:#611f69,color:#fff
{{< /mermaid >}}

## Testing and Verification

After deploying the fix:

```bash
# 1. Verify KMS policy includes all principals
aws kms get-key-policy \
  --key-id <key-id> \
  --policy-name default

# 2. Trigger a test alarm
aws cloudwatch set-alarm-state \
  --alarm-name "your-alarm-name" \
  --state-value ALARM \
  --state-reason "Testing encryption fix"

# 3. Check Chatbot logs for processing
aws logs tail /aws/chatbot/your-config-name --follow

# 4. Verify Slack notification received
```

**Success criteria:**

- CloudWatch Logs show: "Sending message to Slack"
- SNS metrics show successful delivery
- Slack channel receives the notification

## Key Takeaways

1. **Encrypted SNS requires THREE service principals:**
   - `sns.amazonaws.com` - to encrypt messages at rest
   - `cloudwatch.amazonaws.com` - to publish encrypted alarms
   - Both Chatbot roles - to decrypt messages

2. **AWS Chatbot uses two different roles:**
   - Channel role (configured in console)
   - Service-linked role (used by SNS subscriptions)
   - Both need KMS decrypt permissions

3. **Least privilege matters:**
   - Chatbot only needs `kms:Decrypt`
   - Not `kms:GenerateDataKey` (it doesn't encrypt)
   - Over-privileging increases attack surface

4. **Manual steps are unavoidable:**
   - Chatbot configurations not in Terraform
   - Slack app must be installed
   - Bot must be added to channels
   - Document these steps for your team

5. **Test thoroughly in non-production:**
   - Manual SNS publish ≠ CloudWatch alarm
   - Different code paths, different permissions
   - Always test with actual triggers before promoting
   - Wait to observe behavior, don't rush to prod

6. **CloudWatch Logs are your friend:**
   - Enable logging for Chatbot in dev
   - Reveals message format issues early
   - Shows actual errors (not just "no notifications")
   - Critical for debugging encryption issues

## What Worked vs. What Didn't

### ❌ What Didn't Work

**Testing with manual SNS publish:**

```bash
aws sns publish --topic-arn ... --message "Test"
```

- Bypasses CloudWatch
- Different message format
- Doesn't test full flow

**Granting permissions only to channel role:**

- SNS subscriptions use service-linked role
- Messages silently fail to decrypt

**Checking SNS delivery metrics alone:**

- SNS shows "delivered" even if Chatbot rejects
- Need Chatbot logs to see rejections

### ✅ What Worked

**Triggering actual CloudWatch alarms in dev:**

```bash
aws cloudwatch set-alarm-state --alarm-name ... --state-value ALARM
```

- Tests complete flow in safe environment
- Same code path as production
- Reveals actual issues before they impact users

**Checking CloudWatch Logs:**

```bash
aws logs tail /aws/chatbot/config-name --follow
```

- Shows if messages arriving
- Reveals format issues
- Displays actual errors

**Adding all three service principals:**

- CloudWatch can publish
- SNS can encrypt
- Chatbot can decrypt

## The Aftermath

After deploying this fix to development and thoroughly validating:

- ✅ Slack notifications working correctly
- ✅ Security compliance achieved (encrypted SNS)
- ✅ Infrastructure as code (Chatbot IAM role)
- ✅ Least privilege permissions (removed unnecessary GenerateDataKey)
- ✅ Validated in dev before production deployment

Time to discover issue: ~1 day of observation  
Time to debug and fix: ~2 hours  
Production incidents prevented: 1  
Lessons learned: Priceless

## For Future Reference

If you're adding KMS encryption to SNS topics used with AWS Chatbot:

**Checklist:**

- [ ] Add `cloudwatch.amazonaws.com` to KMS policy
- [ ] Add `sns.amazonaws.com` to KMS policy
- [ ] Add Chatbot channel role to KMS policy
- [ ] Add `AWSServiceRoleForAWSChatbot` to KMS policy
- [ ] Grant only `kms:Decrypt` to Chatbot roles
- [ ] Create Chatbot IAM role in Terraform
- [ ] Update Chatbot console config to use new role
- [ ] Verify Slack app installed in workspace
- [ ] Verify bot added to Slack channels
- [ ] Test with actual CloudWatch alarm
- [ ] Check CloudWatch Logs for Chatbot
- [ ] Verify SNS metrics show delivery
- [ ] Confirm Slack notifications received

## References

- [AWS KMS Key Policies](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [AWS Chatbot IAM Roles](https://docs.aws.amazon.com/chatbot/latest/adminguide/chatbot-iam.html)
- [SNS Encryption with KMS](https://docs.aws.amazon.com/sns/latest/dg/sns-server-side-encryption.html)
- [CloudWatch Alarms with Encrypted SNS](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)

## Wrapping Up

This experience reinforced that adding encryption isn't just about flipping a switch - it's about understanding the entire message flow and all the services involved. AWS Chatbot's dual-role architecture is a particular gotcha that isn't well documented.

If you're managing Slack notifications via AWS Chatbot and planning to encrypt your SNS topics, hopefully this post saves you the debugging time. Always test with actual CloudWatch alarms in a non-production environment, not just manual SNS publishes.

---

*Found this helpful? Hit me up on [LinkedIn](https://linkedin.com/in/carimfadil).*
