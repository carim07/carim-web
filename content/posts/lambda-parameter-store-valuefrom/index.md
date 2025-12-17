---
title: "Why AWS Lambda Doesn't Support ValueFrom for Environment Variables (And How to Deal With It)"
date: 2025-12-23T10:00:00-00:00
lastmod: 2025-12-23T10:00:00-00:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "The journey from build-time .env generation to runtime Parameter Store loading for Lambda functions, the rate limiting challenges, and why ECS has a feature Lambda desperately needs."

tags: ["DevOps", "AWS", "Lambda", "Parameter Store", "SSM", "ECS", "Terraform", "Serverless"]
categories: ["DevOps"]

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

If you've ever looked at ECS task definitions with envy from the Lambda side, you're not alone.

<!--more-->

If you use AWS Lambda for background workers, listeners, or scheduled tasks, you've likely dealt with secrets management. Secrets are typically stored in AWS Parameter Store, but CI/CD pipelines often fetch them at build time and bake them into `.env` files that ship with each Lambda package. When you decide to move to **runtime** Parameter Store loading—like ECS does natively with `valueFrom`—you discover a fundamental difference between how ECS and Lambda handle environment variables. One that can cause weeks of debugging throttling errors.

This is the story of that migration, the rate limiting nightmares, and how to ultimately find a balance.

## The Starting Point: CI/CD-Generated .env Files

Before migration, secrets are already in AWS Parameter Store, but CI/CD pipelines fetch them at build time and generate `.env` files dynamically:

{{< mermaid >}}
flowchart LR
    subgraph AWS["AWS Parameter Store"]
        Params["Parameters<br/>/myapp/prod/*"]
    end
    
    subgraph CICD["CI/CD Pipeline"]
        Fetch["Fetch Parameters"]
        Generate["Generate .env file"]
        Build["Build & Package"]
    end
    
    subgraph Lambda["Lambda Functions"]
        L1["Lambda 1<br/>(with .env baked in)"]
        L2["Lambda 2<br/>(with .env baked in)"]
        L3["Lambda N..."]
    end
    
    Params -->|"aws ssm get-parameters"| Fetch
    Fetch --> Generate
    Generate -->|".env file"| Build
    Build -->|"Build-time injection"| Lambda
    
    style Params fill:#90EE90,stroke:#333,color:#000
    style Fetch fill:#FFE4B5,stroke:#333,color:#000
    style Generate fill:#FFE4B5,stroke:#333,color:#000
    style Build fill:#FFE4B5,stroke:#333,color:#000
{{< /mermaid >}}

### How It Works

The CI/CD pipeline:
1. Authenticates to AWS
2. Runs a script to fetch all parameters from Parameter Store
3. Generates a `.env` file with all the values
4. Builds the Lambda package with the `.env` file included
5. Deploys the package

### The Problems

1. **Build-time vs runtime** - Variables are baked into Lambda packages at build time, not fetched at runtime
2. **Redeployment for rotation** - Changing a secret in Parameter Store requires redeploying every Lambda
3. **Long CI/CD pipelines** - The parameter fetching step adds time to every build
4. **Inconsistent state** - If a deployment fails halfway, some Lambdas have new secrets, others have old ones
5. **No dynamic updates** - Can't update configuration without a full deployment cycle

## The Dream: ECS-Style ValueFrom

When you look at how ECS handles this, you find the elegant solution you want:

```hcl
# ECS Task Definition - Environment variables from Parameter Store
resource "aws_ecs_task_definition" "api" {
  container_definitions = jsonencode([{
    secrets = [
      {
        name      = "DATABASE_PASSWORD"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/DATABASE_PASSWORD"
      },
      {
        name      = "API_KEY"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/API_KEY"
      }
      # ... 130+ more variables
    ]
  }])
}
```

**What happens with ECS:**
1. Task starts
2. ECS agent fetches all parameters from Parameter Store
3. Parameters are injected as environment variables
4. Container starts with `process.env.DATABASE_PASSWORD` already set
5. **The application code doesn't know or care about Parameter Store**

This is beautiful. The container has zero awareness of where its environment variables come from. It's pure environment variable injection, handled by the platform.

## The Reality: Lambda Doesn't Support ValueFrom

Here's the painful truth: **AWS Lambda does not support `valueFrom` or `secrets` in its environment variable configuration.**

```hcl
# Lambda Function - This is ALL you can do
resource "aws_lambda_function" "worker" {
  function_name = "my-worker"
  
  environment {
    variables = {
      # Only static values allowed
      NODE_ENV      = "production"
      RELEASE_STAGE = "production"
      # Cannot do: DATABASE_PASSWORD = valueFrom("arn:aws:ssm:...")
    }
  }
}
```

Lambda environment variables are:
- **Static strings only** - No references to Parameter Store, Secrets Manager, or any external source
- **Set at deployment time** - Not fetched at runtime
- **Visible in the AWS Console** - Anyone with Lambda access can see them
- **4KB total limit** - All environment variables combined can't exceed 4KB

### Why This Matters

If you want Lambda to use Parameter Store secrets:
1. Your **application code** must fetch them
2. You need to handle **authentication to SSM**
3. You need to handle **caching** (or not)
4. You need to handle **errors and retries**
5. **Cold starts get slower** - Every cold start potentially means API calls to Parameter Store

## The Solution: Runtime Parameter Store Loading

Since Lambda can't do `valueFrom`, you build it yourself in the application layer:

{{< mermaid >}}
flowchart TB
    subgraph Lambda["Lambda Cold Start"]
        Init["Lambda Handler Invoked"]
        Load["loadEnvVarsFromParameterStore()"]
        SSM["AWS SSM Client"]
        Validate["Validate & Merge"]
        Ready["Application Ready"]
    end
    
    subgraph AWS["AWS Parameter Store"]
        Params["130+ Parameters<br/>/myapp/prod/*"]
    end
    
    Init --> Load
    Load --> SSM
    SSM -->|"GetParametersByPath<br/>(10 params per call)"| Params
    Params -->|"Paginated response"| SSM
    SSM --> Validate
    Validate --> Ready
    
    style Init fill:#FFE4B5,stroke:#333,color:#000
    style Load fill:#87CEEB,stroke:#333,color:#000
    style SSM fill:#DDA0DD,stroke:#333,color:#000
    style Params fill:#90EE90,stroke:#333,color:#000
    style Ready fill:#90EE90,stroke:#333,color:#000
{{< /mermaid >}}

### The Application Code

Create an env loader that fetches parameters during Lambda initialization:

```typescript
// env.aws.loader.ts
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm"
import { from, expand, reduce, EMPTY, of } from "rxjs"

const AWS_ENV_MAP: Record<ReleaseStage, string> = {
  sandbox: "sandbox",
  development: "dev",
  staging: "staging",
  production: "prod",
}

export const getParameterPath = (releaseStage: ReleaseStage): string => 
  `/myapp/${AWS_ENV_MAP[releaseStage]}/`

export const loadEnvVarsFromParameterStore: EnvVarsLoader = () => {
  // Skip in test environments
  if (isTestNodeEnv) return of({})

  const ssmClient = createSsmClient()
  const releaseStage = getReleaseStage()
  const paramPath = getParameterPath(releaseStage)

  console.log("loadEnvVarsFromParameterStore:", { releaseStage, paramPath })
  console.time("loadedEnvVarsFromParameterStore")

  return from(getParametersByPath(ssmClient, paramPath)).pipe(
    // Handle pagination - GetParametersByPath returns max 10 at a time
    expand(({ NextToken, Parameters }, index) => {
      const count = Parameters?.length || 0
      console.log("loadedEnvVarsFromParameterStore:", { index, count })
      return NextToken ? getParametersByPath(ssmClient, paramPath, NextToken) : EMPTY
    }),
    // Merge all pages into a single object
    reduce((acc, output) => {
      return { ...acc, ...mapParametersToEnvVars(output) }
    }, {} as EnvVars),
    tap(() => {
      console.timeEnd("loadedEnvVarsFromParameterStore")
    }),
  )
}
```

### The Terraform Side

Every Lambda module automatically includes Parameter Store permissions:

```hcl
# Lambda module - Required policies for all Lambdas
locals {
  required_policies = [
    # Parameter Store access policy
    {
      actions = [
        "ssm:GetParametersByPath",
        "ssm:GetParameters",
        "ssm:GetParameter"
      ]
      resources = [
        "arn:aws:ssm:${local.aws_region}:${local.aws_account_id}:parameter/${local.app_parameters_path[var.release_stage]}/*"
      ]
    },
    # KMS decrypt policy for SecureString parameters
    {
      actions   = ["kms:Decrypt"]
      resources = ["arn:aws:kms:${local.aws_region}:${local.aws_account_id}:key/alias/aws/ssm"]
    }
  ]
}
```

## The Disaster: Rate Exceeded

Everything works great in development. Then you deploy to production with 25+ Lambda functions, and chaos ensues:

```
ThrottlingException: Rate exceeded
```

### Understanding Parameter Store Rate Limits

AWS Parameter Store has **very low default throughput limits**:

| Tier | GetParameter / GetParameters | GetParametersByPath |
|------|------------------------------|---------------------|
| Standard | 40 TPS shared | 40 TPS shared |
| Advanced | 100 TPS shared | 100 TPS shared |

**TPS = Transactions Per Second**, and it's **shared across all API calls in the account**.

### The Math Problem

Let's do the math:
- You have **130+ parameters** per environment
- `GetParametersByPath` returns **max 10 parameters per call** (AWS limit)
- So each Lambda cold start needs **13+ API calls** to load all parameters
- You have **25+ Lambda functions**
- During a deployment, **all 25 functions cold start simultaneously**

**25 functions × 13 API calls = 325 API calls** in seconds

With a 40 TPS limit, you're **8x over the quota** during deployments.

### Symptoms

- Random Lambda timeouts during deployment
- Intermittent failures across all functions
- Some functions starting fine, others failing
- No clear pattern—whichever function hits the rate limit fails

## The Fix: Reducing Parameter Store API Calls

Several options exist:

### Option 1: Enable High Throughput in Parameter Store Settings

AWS allows you to increase the throughput limit directly in the Parameter Store console:

1. Go to **AWS Systems Manager → Parameter Store → Settings**
2. Under **Parameter Store throughput**, select **High throughput limit**
3. This increases your limit from 40 TPS to **1,000 TPS**

{{< admonition type=warning title="Cost Consideration" >}}
High throughput incurs additional charges per API call above the standard tier limit. Check [AWS pricing](https://aws.amazon.com/systems-manager/pricing/) for current rates.
{{< /admonition >}}

This is a quick win and something you should enable immediately, but it doesn't solve the fundamental issue of making too many API calls.

### Option 2: Add Retry Logic with Adaptive Mode

Configure your SSM client with adaptive retry mode and increased max attempts:

```typescript
import { SSMClient } from "@aws-sdk/client-ssm"

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION,
  retryMode: "adaptive",
  maxAttempts: 5,
})
```

**Why adaptive mode?**
- Automatically adjusts retry delays based on error responses
- Uses exponential backoff with jitter
- Handles throttling errors (429) gracefully
- Better than the default "standard" retry mode for high-concurrency scenarios

This helps significantly during deployment stampedes, but you may still see occasional throttling with many concurrent cold starts.

### Option 3: Pass Non-Secrets as Lambda Environment Variables

This is the recommended approach. The key insight:

**Not all 130+ parameters are secrets.**

Many are just configuration:
- API endpoints (`EXTERNAL_API_BASE_URL`, `WEBHOOK_URL`)
- Feature flags (`FEATURE_X_ENABLED`, `API_V2_THRESHOLD`)
- Resource identifiers (`SENTRY_DSN`, `ANALYTICS_APP_ID`)
- Queue URLs (`PROCESSING_QUEUE_URL`, `NOTIFICATION_QUEUE_URL`)

These can safely be Lambda environment variables because:
1. They're not sensitive
2. They're already visible in Terraform code
3. They don't need rotation

{{< mermaid >}}
flowchart TB
    subgraph Terraform["Terraform Deployment"]
        NonSecrets["Non-Secret Parameters<br/>(90+ values)"]
        Secrets["Secret Parameters<br/>(40+ values)"]
    end
    
    subgraph Lambda["Lambda Configuration"]
        EnvVars["environment {<br/>variables = {...}<br/>}"]
        IAM["IAM Policy for SSM"]
    end
    
    subgraph Runtime["Lambda Runtime"]
        ProcessEnv["process.env<br/>(Non-secrets ready)"]
        SSMFetch["SSM Fetch<br/>(Secrets only)"]
        Merged["Merged Config"]
    end
    
    NonSecrets -->|"Direct injection"| EnvVars
    Secrets -->|"Stay in SSM"| IAM
    
    EnvVars --> ProcessEnv
    IAM --> SSMFetch
    ProcessEnv --> Merged
    SSMFetch -->|"Only ~4 API calls<br/>instead of 13+"| Merged
    
    style NonSecrets fill:#90EE90,stroke:#333,color:#000
    style Secrets fill:#FFE4B5,stroke:#333,color:#000
    style ProcessEnv fill:#87CEEB,stroke:#333,color:#000
    style SSMFetch fill:#DDA0DD,stroke:#333,color:#000
{{< /mermaid >}}

{{< admonition type=warning title="Remember the 4KB Limit" >}}
Lambda environment variables have a **4KB total limit** for all variables combined. Before moving parameters to environment variables, calculate your total size:

```bash
# Check the size of your env vars in bytes
echo -n "KEY1=value1\nKEY2=value2\n..." | wc -c
```

If you're close to the limit, you may need to be selective about which variables to pass directly.
{{< /admonition >}}

#### A Note on Shared Code and Simplification

In our case, we pass **all** non-secret environment variables to **every** Lambda function. Why? Because we share a common environment validation method across all functions—the same code that validates required variables runs in every Lambda.

This is a simplification that trades some efficiency for consistency:
- ✅ **Pros:** Single source of truth, easier to maintain, no "missing variable" surprises
- ❌ **Cons:** Every Lambda gets variables it may not need, uses more of the 4KB budget

**Future improvement:** Split the validation logic and pass only the variables each Lambda actually needs. This requires more Terraform configuration but is more efficient for Lambda functions with specific, limited requirements.

### The New Math

- **Before:** 130 params ÷ 10 per call = **13 API calls per cold start**
- **After:** 40 secrets ÷ 10 per call = **4 API calls per cold start**

**25 functions × 4 API calls = 100 API calls** - Well under the 40 TPS limit spread over several seconds.

### Implementation Changes

**Terraform Lambda Module:**

```hcl
resource "aws_lambda_function" "this" {
  function_name = var.lambda_name
  
  environment {
    variables = merge(
      {
        NODE_PATH     = "/opt/nodejs/node_modules"
        NODE_ENV      = var.node_env
        RELEASE_STAGE = var.release_stage
      },
      var.non_secret_env_vars  # New: Pass non-secrets directly
    )
  }
}
```

**Application Code:**

```typescript
export const loadEnvVarsFromParameterStore: EnvVarsLoader = () => {
  if (isTestNodeEnv) return of({})

  const ssmClient = createSsmClient()
  const releaseStage = getReleaseStage()
  
  // Only fetch the secrets path now
  const secretsPath = `/myapp/${AWS_ENV_MAP[releaseStage]}/secrets/`
  
  // ... rest of the loading logic
}
```

## Bonus: Deployment Script with Retry Logic

For local development and debugging, create a script that handles Parameter Store throttling gracefully:

```bash
#!/bin/bash
# get-env-vars.sh - Fetches all env vars with exponential backoff

function GetParameterStoreValues() {
  local max_retries=5
  local backoff=2
  
  while true; do
    attempt=1
    while [[ $attempt -le $max_retries ]]; do
      params=$(aws ssm get-parameters-by-path \
        --path "$paramNamePrefix" \
        --region $REGION \
        --recursive \
        --with-decryption \
        $tokenParam)

      if [[ $? -eq 0 ]]; then
        break
      fi

      # Add jitter to prevent thundering herd
      local backoff_with_jitter=$(add_jitter $backoff)
      echo "🔄 Throttling detected, retrying in $backoff_with_jitter seconds..." >&2
      sleep $backoff_with_jitter
      backoff=$((backoff * 2))
      attempt=$((attempt + 1))
    done
    
    # Handle pagination...
  done
}
```

The jitter is crucial—without it, multiple parallel processes retry at exactly the same time and hit the rate limit again.

## What We Wish AWS Would Add

If you could ask AWS for one Lambda feature, it would be:

```hcl
# DREAM: Lambda with valueFrom support
resource "aws_lambda_function" "worker" {
  function_name = "my-worker"
  
  environment {
    variables = {
      NODE_ENV = "production"
    }
    # Please, AWS, add this:
    secrets = [
      {
        name      = "DATABASE_PASSWORD"
        valueFrom = "arn:aws:ssm:us-west-2:123456789012:parameter/myapp/prod/DATABASE_PASSWORD"
      }
    ]
  }
}
```

This would:
1. Eliminate application-level SSM code for Lambda
2. Move the API calls to Lambda's init phase (AWS's concern, not ours)
3. Allow AWS to optimize and cache across function instances
4. Provide parity with ECS, EKS, and other compute services

## Lessons Learned

### 1. Build-Time vs Runtime: A Fundamental Shift

Moving from CI/CD-generated `.env` files to runtime Parameter Store loading isn't just a technical change—it's a different operational model. Runtime loading means faster secret rotation but adds cold start latency.

### 2. ECS and Lambda Are Not Equals

Despite both being "serverless" (in that you don't manage servers), they have fundamentally different capabilities. ECS gets `valueFrom` for free; Lambda makes you build it yourself.

### 3. Rate Limits Compound with Scale

40 TPS sounds reasonable until you have 25 functions doing 13 API calls each. Always calculate your worst-case scenario (deployment stampede).

### 4. Not Everything Needs to Be a Secret

Separating secrets from configuration reduces API calls and simplifies debugging (you can see non-secret config in the Lambda console).

### 5. Build Resilience for AWS API Limits

Exponential backoff with jitter isn't optional—it's required for any production system using AWS APIs at scale.

## The Comparison: ECS vs Lambda Environment Variables

| Capability | ECS | Lambda |
|------------|-----|--------|
| Static environment variables | ✅ | ✅ |
| `valueFrom` Parameter Store | ✅ | ❌ |
| `valueFrom` Secrets Manager | ✅ | ❌ |
| Automatic secret injection | ✅ | ❌ |
| Application code for secrets | Not needed | Required |
| Cold start impact | None | +200-500ms |
| API call rate limits | AWS handles | You handle |

## Wrapping Up

Moving from build-time `.env` generation to runtime Parameter Store loading is the right decision for operational flexibility—secrets can now be rotated without redeploying Lambdas. But Lambda's lack of `valueFrom` support makes it more complex than expected.

If you're planning a similar migration:

1. **Audit your parameters** - Separate secrets from configuration
2. **Calculate your API call math** - Parameters ÷ 10 × function count
3. **Implement retry with backoff** - You will hit rate limits
4. **Consider passing non-secrets as Lambda env vars** - Reduces API calls dramatically
5. **Watch your cold start times** - SSM calls add latency

The Lambda team, if you're reading this: please add `valueFrom` support. ECS has had it for years. We'd love to stop writing SSM loading code in every Lambda-based project.

---

*Have you dealt with similar challenges? I'd love to hear your solutions. Find me on [LinkedIn](https://linkedin.com/in/carimfadil).*

