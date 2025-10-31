---
title: "The Mystery of the Disappearing Lambda Triggers: A Terraform State Drift Story"
date: 2025-10-31T10:00:00-07:00
lastmod: 2025-10-31T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "A deep dive into AWS Lambda permission drift with Terraform, and how to fix it using replace_triggered_by lifecycle rules."

tags: ["Terraform", "AWS", "Lambda", "DevOps", "IaC", "EventBridge"]
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

We've all been there: you start the day feeling good about wrapping up last sprint's work, coffee in hand, ready to tackle something new. Then comes the Slack notification that changes everything.

"Hey, can you look into why a couple of Lambdas didn't run two weeks ago?"

<!--more-->

The mystery was puzzling: scheduled Lambda functions had missed their executions on a specific day, then resumed normal operation the next day without intervention. These weren't critical path functions (those would have triggered immediate alerts), but they were important enough that we needed to understand what happened and prevent it from recurring.

Working with a teammate, we discovered that two functions had failed to execute—one triggered by EventBridge rules, another by S3 events. Different triggers, same problem, same day. That pointed to something systemic.

As we investigated the affected Lambda in the console, everything appeared normal. CloudWatch logs showed nothing unusual. CloudTrail events for that timeframe revealed no anomalies. Then, while checking back on the Lambda configuration, we noticed something odd: the trigger had disappeared right before our eyes.

A quick check confirmed our suspicion—a production deployment had just completed. The automated Terraform deployment from our CI/CD pipeline had somehow disconnected the triggers. The infrastructure was all there—EventBridge rules, targets, even the Lambda function itself—but they were no longer wired together.

## The Investigation

Digging deeper, we found something interesting:

- ✅ EventBridge rules existed and were enabled
- ✅ EventBridge targets pointed to the correct Lambda ARN
- ❌ Lambda triggers showed nothing in the console
- ❌ Manual invocations from EventBridge failed with "not authorized" errors

This pointed to one thing: **missing Lambda permissions**.

In AWS, having an EventBridge rule with a target isn't enough. You also need an `aws_lambda_permission` resource that explicitly grants EventBridge the right to invoke your Lambda. These are two separate resources:

```hcl
# The EventBridge rule and target
resource "aws_cloudwatch_event_rule" "my_rule" {
  name                = "my-scheduled-rule"
  schedule_expression = "cron(0 12 * * ? *)"
}

resource "aws_cloudwatch_event_target" "my_target" {
  rule = aws_cloudwatch_event_rule.my_rule.name
  arn  = aws_lambda_function.my_function.arn
}

# The permission (THIS was missing!)
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.my_function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.my_rule.arn
}
```

When we checked the Lambda's resource policy:

```bash
aws lambda get-policy \
  --function-name my_scheduled_lambda \
  --region us-west-2
```

The permissions were indeed missing. But the question remained: **Why?**

### The AWS Architecture Problem

Here's what the architecture looks like when everything is configured correctly vs. when permissions are missing:

{{< mermaid >}}
graph LR
    subgraph working[" Working Configuration "]
        EB1[EventBridge Rule]
        ET1[EventBridge Target]
        LP1[Lambda Permission]
        L1[Lambda Function]

        EB1 -->|points to| ET1
        ET1 -->|invokes| L1
        LP1 -.->|grants access| L1
        EB1 -.->|authorized by| LP1

        style L1 fill:#90EE90,stroke:#2d5016,color:#000
        style LP1 fill:#90EE90,stroke:#2d5016,color:#000
    end

    subgraph broken[" Broken Configuration "]
        EB2[EventBridge Rule]
        ET2[EventBridge Target]
        LP2[Lambda Permission]
        L2[Lambda Function]

        EB2 -->|points to| ET2
        ET2 -.->|❌ BLOCKED| L2
        LP2 -.->|MISSING| L2

        style L2 fill:#FFB6C1,stroke:#8B0000,color:#000
        style LP2 fill:#FFB6C1,stroke:#8B0000,stroke-dasharray: 5 5,color:#000
    end
{{< /mermaid >}}

## The Root Cause

After investigation and research, we discovered this is a **known behavior in AWS/Terraform interactions**:

1. When AWS deletes a Lambda function, it **automatically deletes all associated permissions**
2. This is AWS behavior, not a Terraform bug
3. When Terraform recreates a Lambda function (during a deployment), AWS silently removes the permissions
4. Terraform's state file still thinks the permissions exist (stale state)
5. The permissions **don't show up in the plan** when the Lambda is replaced
6. They only appear as needing recreation on the **next** Terraform run

This creates a dangerous window where your infrastructure looks fine in Terraform, but is actually broken in AWS.

### But Wait—Why Were Lambdas Being Replaced?

Here's where the plot thickens. In normal circumstances, Lambda deployments with just code changes should **update in-place**, not replace the function. So we had to ask: what actually triggered the replacement that caused this mess?

Digging through deployment history and CloudTrail logs revealed a fascinating story of not one, but two separate architectural migrations that both caused Lambda replacements.

#### The First Migration: Zip Packages to Container Images

The initial replacement happened during a major infrastructure migration. We were moving from:

**Before:**

- Package type: `Zip`
- Runtime: `nodejs22.x`
- Dependencies: EFS mount (`/mnt/efs/node_modules`)
- Deployment: Upload zip files to S3

**After:**

- Package type: `Image`
- Dependencies: Baked into container images
- Deployment: Push to ECR, reference image URI
- Node modules: Included in container layer (`/opt/nodejs/node_modules`)

This is a **breaking change** for AWS Lambda. You cannot change package type from `Zip` to `Image` in-place—AWS requires a complete delete and recreate. When Terraform executed this migration:

1. Deleted old Zip-based Lambda functions
2. AWS automatically deleted all associated permissions
3. Created new Image-based Lambda functions
4. **But didn't recreate the permissions in the same run**

This was understandable—it was a one-time architectural migration. The real surprise came next.

#### The Second Issue: The Module Refactoring Migration

After successfully migrating to container images, we noticed something in the deployment logs. During the first few deployments after the migration, Lambdas continued to be replaced instead of updated in-place.

The CloudTrail logs showed a clear pattern:

- October 15: Initial Zip→Image migration (intentional replacements)
- October 22: Lambda replaced (version 105)
- October 30: Lambda replaced again (version 106)

Comparing Terraform plans between these runs revealed what was happening. The plans showed resources switching between:

```
- module.my_lambda.aws_lambda_function.this_image[0] (will be destroyed)
+ module.my_lambda.aws_lambda_function.this (will be created)
```

**The root cause:** During the Zip→Image migration, our Lambda module was also being refactored from a dual-resource pattern to a cleaner single-resource design. The old module had:

```hcl
# Old module structure (used during migration)
resource "aws_lambda_function" "this" {
  count = var.package_type == "Zip" ? 1 : 0
  # Zip package configuration
}

resource "aws_lambda_function" "this_image" {
  count = var.package_type == "Image" ? 1 : 0
  # Container image configuration
}
```

The new module uses a cleaner single resource:

```hcl
# New module structure (current)
resource "aws_lambda_function" "this" {
  package_type = "Image"
  image_uri    = var.image_uri
  # Single resource handles everything
}
```

The migration sequence was:

1. **First deployment (Oct 15):** Migrated from Zip to Image, creating `this_image[0]` resources
2. **Module update:** Refactored to use single `this` resource
3. **Subsequent deployments (Oct 22, 30):** Terraform migrating state from `this_image[0]` to `this`

During these transitional deployments:

1. Terraform saw `this_image[0]` in state file
2. Current code defined `this`
3. Terraform destroyed `this_image[0]`, created `this`
4. AWS deleted all permissions when Lambda was deleted
5. Permissions weren't recreated in the same run

After a few deployment cycles, Terraform completed the state migration automatically, and subsequent plans showed the correct behavior: in-place updates.

#### The Lesson

What appeared to be a simple permission drift issue was actually a perfect storm of changes:

1. **AWS behavior**: Auto-deleting permissions when Lambdas are deleted
2. **Planned migration**: Zip→Image package type requiring replacement
3. **Module refactoring**: State migration from dual-resource to single-resource pattern
4. **Transitional period**: Multiple deployments needed to fully reconcile state

The `replace_triggered_by` solution not only fixed the immediate permission drift but also protected us during the state migration period. Even more importantly, it will prevent this issue if we ever need to replace Lambdas again for any reason (VPC changes, etc.).

The bigger lesson: major infrastructure migrations rarely happen in isolation. When multiple changes compound, having defensive infrastructure patterns like `replace_triggered_by` becomes critical.

## Why Terraform Doesn't Catch This

The issue is that `aws_lambda_permission` resources don't automatically detect when the Lambda function they reference has been recreated. Even though the permission references the Lambda, Terraform treats them as independent resources during the replacement operation.

Here's what happens during a typical Lambda deployment:

```
Terraform Plan:
- aws_lambda_function.this will be replaced
  (image_uri changed)

Terraform Apply:
1. Delete old Lambda → AWS deletes permissions automatically
2. Create new Lambda → Success!
3. Terraform checks permissions... state says they exist ✓

Next Terraform Run:
- aws_lambda_permission.eventbridge[0] will be created
  (drift detected - permission missing in AWS)
```

Notice the one-run delay? That's the problem.

### The State Drift Timeline

This sequence diagram illustrates exactly how the state drift occurs:

{{< mermaid >}}
sequenceDiagram
    participant Dev as Developer
    participant TF as Terraform
    participant State as Terraform State
    participant AWS as AWS

    Note over Dev,AWS: Initial Deployment Run
    Dev->>TF: terraform plan
    TF->>State: Check current state
    State-->>TF: Lambda + Permissions exist
    TF->>AWS: Check actual resources
    AWS-->>TF: Lambda image changed
    TF->>Dev: Plan: Replace Lambda

    Dev->>TF: terraform apply
    TF->>AWS: Delete old Lambda
    Note over AWS: AWS auto-deletes<br/>Lambda permissions!
    TF->>AWS: Create new Lambda
    AWS-->>TF: Lambda created ✓
    TF->>State: Update: Lambda replaced
    Note over State: Permissions still marked<br/>as "existing" ❌

    Note over Dev,AWS: Next Deployment Run (Drift Detection)
    Dev->>TF: terraform plan
    TF->>State: Check permissions
    State-->>TF: Permissions exist (WRONG!)
    TF->>AWS: Check permissions
    AWS-->>TF: Permissions NOT FOUND
    TF->>Dev: Plan: Create permissions

    Note over Dev,AWS: Window of Broken Infrastructure!
{{< /mermaid >}}

## The Solution: `replace_triggered_by`

Terraform 1.2 introduced a lifecycle meta-argument called `replace_triggered_by` specifically for handling this class of problems. It forces Terraform to recreate a resource whenever another resource is replaced.

Here's how we implemented it:

### For Permissions Inside the Lambda Module

```hcl
resource "aws_lambda_permission" "eventbridge_execution_allowed" {
  count = var.eventbridge_execution_allowed_arns != null ? length(var.eventbridge_execution_allowed_arns) : 0

  statement_id  = "AllowExecutionFromEventBridge_${count.index}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = var.eventbridge_execution_allowed_arns[count.index]

  # This forces Terraform to recreate permissions when Lambda changes
  lifecycle {
    replace_triggered_by = [
      aws_lambda_function.this
    ]
  }
}
```

### The Module Boundary Problem

However, we hit a snag with S3-triggered Lambdas. We had some permissions defined **outside** the Lambda module:

```hcl
# In the main terraform config (outside the module)
resource "aws_lambda_permission" "s3_invoke" {
  function_name = module.my_lambda.lambda_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.my_bucket.arn

  lifecycle {
    replace_triggered_by = [
      module.my_lambda.aws_lambda_function.this  # ❌ This doesn't work!
    ]
  }
}
```

**The problem:** `replace_triggered_by` can only reference direct resources, not module outputs. Even if you expose the Lambda resource as an output, you can't use it in `replace_triggered_by` across module boundaries.

#### Visualizing the Module Boundary Issue

{{< mermaid >}}
graph TB
    subgraph "Module Boundary Issue"
        subgraph "lambda_module"
            LF1[aws_lambda_function.this]
            LP1[aws_lambda_permission<br/>EventBridge]

            LP1 -.->|replace_triggered_by ✓| LF1

            style LP1 fill:#90EE90,stroke:#2d5016,color:#000
        end

        subgraph "root_config"
            S3[aws_s3_bucket]
            LP2[aws_lambda_permission<br/>S3 invoke]

            LP2 -->|function_name| LF1
            LP2 -.->|replace_triggered_by ❌<br/>can't cross boundary| LF1
            S3 -->|source_arn| LP2

            style LP2 fill:#FFB6C1,stroke:#8B0000,color:#000
        end
    end

    Note[Module outputs can't be used<br/>in replace_triggered_by]
    style Note fill:#FFE4B5,stroke:#8B4513,color:#000
{{< /mermaid >}}

### The Final Solution: Move Permissions Into the Module

We solved this by moving **all** permission creation into the Lambda module:

**Step 1: Add an optional parameter for S3 buckets**

```hcl
# modules/lambda/variable.tf
variable "s3_execution_allowed_arns" {
  description = "List of S3 bucket ARNs allowed to invoke this Lambda"
  type        = list(string)
  default     = null
}
```

**Step 2: Create S3 permissions inside the module**

```hcl
# modules/lambda/main.tf
resource "aws_lambda_permission" "s3_execution_allowed" {
  count = var.s3_execution_allowed_arns != null ? length(var.s3_execution_allowed_arns) : 0

  statement_id  = "AllowExecutionFromS3Bucket_${count.index}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.s3_execution_allowed_arns[count.index]

  lifecycle {
    replace_triggered_by = [
      aws_lambda_function.this
    ]
  }
}
```

**Step 3: Update Lambda configurations to use the module parameter**

```hcl
module "my_lambda" {
  source = "./modules/lambda"
  # ... other parameters ...
  s3_execution_allowed_arns = [aws_s3_bucket.my_bucket.arn]
}

# Remove the external aws_lambda_permission resource entirely
```

#### Before and After Architecture

{{< mermaid >}}
graph TB
    subgraph "BEFORE: Broken Configuration"
        subgraph "lambda_module_before"
            LF1[Lambda Function]
            LP1[EventBridge Permission]

            LP1 -.->|replace_triggered_by ✓| LF1
        end

        subgraph "root_config_before"
            LP2[S3 Permission ❌]

            LP2 -.->|❌ Can't trigger<br/>on Lambda replace| LF1
        end

        style LP2 fill:#FFB6C1,stroke:#8B0000,color:#000
    end

    subgraph "AFTER: Working Configuration"
        subgraph "lambda_module_after"
            LF2[Lambda Function]
            LP3[EventBridge Permission]
            LP4[S3 Permission]

            LP3 -.->|replace_triggered_by ✓| LF2
            LP4 -.->|replace_triggered_by ✓| LF2

            style LP3 fill:#90EE90,stroke:#2d5016,color:#000
            style LP4 fill:#90EE90,stroke:#2d5016,color:#000
            style LF2 fill:#90EE90,stroke:#2d5016,color:#000
        end

        subgraph "root_config_after"
            Note[All permissions<br/>now in module!]
            style Note fill:#E6F3FF,stroke:#1e40af,color:#000
        end
    end
{{< /mermaid >}}

## The Results

After implementing this solution:

1. **All Lambda permissions are now co-located with the Lambda resource**
2. **`replace_triggered_by` works correctly** since everything is in the same module
3. **No more state drift** - permissions are recreated in the same run as the Lambda
4. **Consistent pattern** - EventBridge, API Gateway, and S3 permissions all managed the same way

When we run `terraform plan` and the Lambda needs replacement, we now see:

```
Terraform will perform the following actions:

  # module.my_lambda.aws_lambda_function.this will be replaced

  # module.my_lambda.aws_lambda_permission.eventbridge_execution_allowed[0] will be replaced

  # module.my_lambda.aws_lambda_permission.s3_execution_allowed[0] will be replaced
```

All in the same plan! No more one-run delay, no more missing triggers.

## Key Takeaways

1. **AWS automatically deletes Lambda permissions when the Lambda is deleted** - this is by design, not a bug

2. **Terraform doesn't always detect this deletion during the replacement plan** - it only shows up on the next run

3. **`replace_triggered_by` is the correct solution** - but it only works within the same module/configuration

4. **Module boundaries matter** - you can't use `replace_triggered_by` across module boundaries, even with outputs

5. **Co-locate dependent resources** - keep tightly coupled resources (like Lambdas and their permissions) in the same module

## What About Older Terraform Versions?

If you're stuck on Terraform < 1.2, you have a few options, though none are as clean as `replace_triggered_by`:

- **Document the behavior**: Accept the one-run delay and make sure your team knows to run apply twice after Lambda replacements
- **Manual tainting**: Use `terraform taint` on permission resources when you know a Lambda will be replaced
- **Wrapper scripts**: Create automation that handles the two-step apply process
- **Use Terraform Cloud**: The drift detection features can help catch these issues

That said, if you can upgrade to Terraform 1.2+, it's worth it just for this feature alone.

## Monitoring and Prevention

After this incident, we also set up CloudWatch alarms to catch permission issues faster. We now monitor Lambda invocation failures and compare expected vs actual EventBridge trigger counts. It won't prevent the issue, but at least we'll know immediately if something goes wrong.

## References

- [Terraform `replace_triggered_by` documentation](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle#replace_triggered_by)
- [Stack Overflow: Lambda permission recreation causing downtime](https://stackoverflow.com/questions/67058655/terraform-recreates-api-permissions-for-lambda-on-each-apply-causing-downtime-l)
- [Stack Overflow: Lambda permission replaced every apply](https://stackoverflow.com/questions/59369087/terraform-0-12-aws-lambda-permission-resource-replaced-every-apply)

## Wrapping Up

What started as a simple "why didn't these Lambdas run?" question turned into a deep dive through AWS behavior, Terraform state management, and the hidden complexities of infrastructure migrations. The Lambda permissions were just the symptom—the real story was about how multiple architectural changes can compound in unexpected ways.

The `replace_triggered_by` solution is elegant, but more importantly, it's defensive. It protects against not just this specific issue, but any future scenario where Lambdas need to be replaced. And given how often infrastructure evolves (VPC changes, runtime updates, package type migrations), that peace of mind is worth it.

If you're managing Lambda functions with Terraform, especially if you've got EventBridge or S3 triggers, I'd highly recommend implementing this pattern before you run into the same drift issues we did.

Have you encountered similar state drift problems with Terraform and AWS? I'd love to hear about your experiences!
