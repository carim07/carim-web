---
title: "Stop Using Long-Lived AWS Credentials in CI/CD: A Guide to GitHub OIDC"
date: 2025-12-16T10:00:00-00:00
lastmod: 2025-12-16T10:00:00-00:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "How to eliminate long-lived AWS credentials from CI/CD pipelines by implementing GitHub OIDC with role chaining for multi-account deployments."

tags: ["DevOps", "AWS", "GitHub Actions", "OIDC", "Security", "IAM", "Terraform", "CI/CD"]
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

Long-lived credentials are a ticking time bomb. Here's how to defuse them.

<!--more-->

When migrating from CircleCI to GitHub Actions, there's a choice: copy the existing AWS access key approach (the easy path) or finally implement something often put off—OIDC-based authentication. Choosing the latter can transform your security posture overnight.

This isn't just a tutorial. It's a guide to implementing GitHub OIDC across a multi-account AWS environment with multiple repositories, multiple AWS accounts, and a role-chaining architecture that takes you from "credentials that never expire" to "credentials that last 15 minutes."

## The Problem: Long-Lived Credentials Everywhere

Before OIDC, typical CI/CD authentication looks like this:

{{< mermaid >}}
flowchart LR
    subgraph CircleCI["CircleCI Environment"]
        EnvVars["Environment Variables<br/>AWS_ACCESS_KEY_ID<br/>AWS_SECRET_ACCESS_KEY"]
    end
    
    subgraph AWS["AWS Accounts"]
        Sandbox["Sandbox Account"]
        Dev["Development Account"]
        Staging["Staging Account"]
        Prod["Production Account"]
    end
    
    EnvVars -->|"Static Credentials<br/>(Never Expire)"| Sandbox
    EnvVars -->|"Static Credentials<br/>(Never Expire)"| Dev
    EnvVars -->|"Static Credentials<br/>(Never Expire)"| Staging
    EnvVars -->|"Static Credentials<br/>(Never Expire)"| Prod
    
    style EnvVars fill:#FF6B6B,stroke:#333,color:#000
    style Sandbox fill:#FFE4B5,stroke:#333,color:#000
    style Dev fill:#FFE4B5,stroke:#333,color:#000
    style Staging fill:#FFE4B5,stroke:#333,color:#000
    style Prod fill:#FFE4B5,stroke:#333,color:#000
{{< /mermaid >}}

### The Security Risks You're Living With

1. **Credentials that never expire** - AWS access keys that have been rotated... once. Maybe twice. They sit in CI/CD environment variables indefinitely.

2. **No audit trail of who used them** - When credentials are shared across jobs and workflows, CloudTrail shows "CI/CD User" for everything. Good luck investigating an incident.

3. **Overly permissive access** - Because rotating credentials is painful, they're made broadly permissive. One key to rule them all.

4. **Credential sprawl** - Different credentials for different environments, stored in multiple places (CI/CD platform, secret managers, some team members' laptops for debugging).

5. **No way to scope by repository** - Any pipeline can technically deploy to any environment if it gets the right credentials.

## The Solution: GitHub OIDC + Role Chaining

After migrating to GitHub Actions, you can implement a completely different architecture:

{{< mermaid >}}
flowchart TB
    subgraph GitHub["GitHub Actions"]
        Workflow["Workflow Execution"]
        OIDC_Token["OIDC Token<br/>(Short-lived JWT)"]
    end
    
    subgraph AWS_Mgmt["Management Account (Identity)"]
        OIDC_Provider["GitHub OIDC Provider"]
        OIDC_Role["GitHubActionsOIDCRole<br/>(15 min session)"]
    end
    
    subgraph Target_Accounts["Workload AWS Accounts"]
        Sandbox_Role["DeploymentRole<br/>(Sandbox)"]
        Dev_Role["DeploymentRole<br/>(Development)"]
        Staging_Role["DeploymentRole<br/>(Staging)"]
        Prod_Role["DeploymentRole<br/>(Production)"]
    end
    
    Workflow -->|"1. Request Token"| OIDC_Token
    OIDC_Token -->|"2. AssumeRoleWithWebIdentity"| OIDC_Provider
    OIDC_Provider -->|"3. Validate & Issue Credentials"| OIDC_Role
    OIDC_Role -->|"4. Role Chain (AssumeRole)"| Sandbox_Role
    OIDC_Role -->|"4. Role Chain (AssumeRole)"| Dev_Role
    OIDC_Role -->|"4. Role Chain (AssumeRole)"| Staging_Role
    OIDC_Role -->|"4. Role Chain (AssumeRole)"| Prod_Role
    
    style OIDC_Token fill:#90EE90,stroke:#333,color:#000
    style OIDC_Provider fill:#87CEEB,stroke:#333,color:#000
    style OIDC_Role fill:#DDA0DD,stroke:#333,color:#000
    style Sandbox_Role fill:#FFD700,stroke:#333,color:#000
    style Dev_Role fill:#FFD700,stroke:#333,color:#000
    style Staging_Role fill:#FFD700,stroke:#333,color:#000
    style Prod_Role fill:#FFD700,stroke:#333,color:#000
{{< /mermaid >}}

### Why a Dedicated Management Account?

The best practice is to host the OIDC provider and base role in a **dedicated Management account** (sometimes called an Identity or Security account), separate from your workload accounts. This approach offers several advantages:

1. **Clear separation of concerns** - Identity infrastructure is isolated from application workloads
2. **Tighter security controls** - The Management account can have stricter access policies since it only handles authentication
3. **Simplified auditing** - All cross-account access originates from a single, controlled location
4. **Follows AWS Well-Architected Framework** - Aligns with the security pillar's identity management recommendations

### What Changes

| Before (Long-lived Credentials) | After (GitHub OIDC) |
|--------------------------------|---------------------|
| Credentials never expire | Credentials last 15 minutes max |
| Stored in CI/CD environment variables | No stored credentials—generated on demand |
| Same credentials for all jobs | Unique session per workflow run |
| No repository-level restrictions | Only specific repos can assume roles |
| Difficult to audit | Full CloudTrail visibility with session names |
| Manual rotation (rarely done) | Automatic—every run gets fresh credentials |

## The Architecture: Role Chaining Explained

Don't just set up OIDC—implement **role chaining** to manage access across multiple AWS accounts. Here's why and how:

{{< mermaid >}}
flowchart TD
    subgraph GH["GitHub Actions Workflow"]
        Token["OIDC JWT Token<br/>Contains: repo, ref, actor, workflow"]
    end
    
    subgraph Step1["Step 1: OIDC Authentication"]
        direction LR
        OIDC["GitHub OIDC Provider<br/>(Management Account)"]
        Base["GitHubActionsOIDCRole<br/>Minimal permissions"]
    end
    
    subgraph Step2["Step 2: Role Chaining"]
        direction LR
        Target["Target Deployment Role<br/>(Workload Account)"]
    end
    
    Token -->|"AssumeRoleWithWebIdentity<br/>Validates: aud, sub claims"| OIDC
    OIDC -->|"Issues temporary credentials"| Base
    Base -->|"AssumeRole<br/>(role-chaining: true)"| Target
    
    style Token fill:#90EE90,stroke:#333,color:#000
    style OIDC fill:#87CEEB,stroke:#333,color:#000
    style Base fill:#DDA0DD,stroke:#333,color:#000
    style Target fill:#FFD700,stroke:#333,color:#000
{{< /mermaid >}}

### Why Role Chaining?

1. **Single Point of Entry**: All GitHub Actions authenticate through one OIDC provider in the Management account. This centralizes trust management.

2. **Separation of Concerns**: The OIDC role has minimal permissions—it can only assume other roles. The actual deployment permissions live in environment-specific roles in each workload account.

3. **Cross-Account Access**: With multiple AWS accounts (sandbox, development, staging, production), role chaining lets you deploy to any of them from a single authentication point.

4. **Least Privilege**: Each repository has its own deployment role with only the permissions it needs.

## Implementation: The Terraform Code

Let's look at the Terraform code. I'll break it down piece by piece.

### Step 1: Create the OIDC Provider

First, create the GitHub OIDC provider in the Management account:

```hcl
# Deploy this in your Management account
locals {
  github_oidc_url           = "https://token.actions.githubusercontent.com"
  github_oidc_condition_key = "token.actions.githubusercontent.com"
  github_oidc_client_id     = "sts.amazonaws.com"
  github_oidc_thumbprint    = "6938fd4d98bab03faadb97b34396831e3780aea1"

  # Repository trust relationship configuration
  trusted_repositories = [
    "repo:${var.github_organization}/frontend-app:*",
    "repo:${var.github_organization}/backend-api:*",
    "repo:${var.github_organization}/mobile-app:*",
    "repo:${var.github_organization}/infrastructure:*"
  ]
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = local.github_oidc_url

  client_id_list  = [local.github_oidc_client_id]
  thumbprint_list = [local.github_oidc_thumbprint]

  tags = {
    Environment = "management"
    Purpose     = "GitHub Actions OIDC Authentication"
  }
}
```

**Key Points:**
- The `thumbprint` is GitHub's OIDC certificate thumbprint—AWS uses this to verify the JWT signature
- `client_id_list` contains `sts.amazonaws.com` because that's what GitHub Actions uses as the audience
- You only need **one** OIDC provider in the Management account, even for multi-account setups

### Step 2: Create the Base OIDC Role

This role is the "entry point" for all GitHub Actions, created in the Management account:

```hcl
# Deploy this in your Management account
resource "aws_iam_role" "github_oidc_role" {
  name = "GitHubActionsOIDCRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRoleWithWebIdentity"
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${var.management_account_id}:oidc-provider/${local.github_oidc_condition_key}"
        }
        Condition = {
          StringEquals = {
            "${local.github_oidc_condition_key}:aud" = local.github_oidc_client_id
          }
          StringLike = {
            "${local.github_oidc_condition_key}:sub" = local.trusted_repositories
          }
        }
      }
    ]
  })

  tags = {
    Purpose = "GitHub OIDC authentication and cross-account role assumption"
  }
}

# Grant this role permission to assume roles in workload accounts
resource "aws_iam_role_policy" "github_oidc_assume_role" {
  name = "AssumeWorkloadAccountRoles"
  role = aws_iam_role.github_oidc_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Resource = [
          "arn:aws:iam::${var.sandbox_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.development_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.staging_account_id}:role/*-deployment-role",
          "arn:aws:iam::${var.production_account_id}:role/*-deployment-role"
        ]
      }
    ]
  })
}
```

**The Magic is in the Conditions:**

- `aud` (audience): Must be `sts.amazonaws.com` - prevents tokens meant for other services from being used
- `sub` (subject): Must match the trusted repositories - this is where access is scoped

The `sub` claim format is: `repo:OWNER/REPO:ref:refs/heads/BRANCH` or `repo:OWNER/REPO:*` for all branches.

**Examples of sub claim patterns:**

```hcl
# Allow all branches from a specific repo
"repo:acme-corp/backend-api:*"

# Allow only main branch
"repo:acme-corp/backend-api:ref:refs/heads/main"

# Allow only pull requests
"repo:acme-corp/backend-api:pull_request"

# Allow specific environment
"repo:acme-corp/backend-api:environment:production"
```

### Step 3: Create Cross-Account Deployment Roles

Each workload account needs a deployment role that trusts the OIDC role from the Management account:

```hcl
# Deploy this in each workload account (sandbox, dev, staging, production)
resource "aws_iam_role" "deployment_role" {
  provider = aws.sandbox  # Change provider for each account

  name = "DeploymentRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          AWS = [
            # Trust the OIDC role from the Management account
            "arn:aws:iam::${var.management_account_id}:role/GitHubActionsOIDCRole"
          ]
        }
      }
    ]
  })

  tags = {
    Environment = "sandbox"
    Purpose     = "Cross-account deployment from GitHub OIDC role"
  }
}

# Repeat for development, staging, production accounts...
```

### Step 4: Repository-Specific Deployment Roles

For finer-grained control, create repository-specific roles in each workload account:

```hcl
# Deploy this in the Production workload account
# Frontend app deployment role - limited to S3 and CloudFront
resource "aws_iam_role" "frontend_deployment_role" {
  provider = aws.production

  name = "frontend-app-deployment-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sts:AssumeRole",
          "sts:TagSession"
        ]
        Effect = "Allow"
        Principal = {
          AWS = [
            # Trust the OIDC role from the Management account
            "arn:aws:iam::${var.management_account_id}:role/GitHubActionsOIDCRole"
          ]
        }
      }
    ]
  })
}

# Attach only the permissions this repo needs
resource "aws_iam_role_policy" "frontend_deployment_policy" {
  provider = aws.production

  name = "frontend-app-deployment-policy"
  role = aws_iam_role.frontend_deployment_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::my-frontend-bucket-*",
          "arn:aws:s3:::my-frontend-bucket-*/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation"
        ]
        Resource = "*"
      }
    ]
  })
}
```

## Implementation: The GitHub Actions Workflow

Now let's see how this is used in actual workflows.

### The Reusable Authentication Action

Create a composite action that handles the two-step authentication:

```yaml
# .github/actions/configure-aws-credentials-chained/action.yml
name: 'Configure AWS Credentials (Chained)'
description: 'Authenticate via OIDC to Management account, then assume a target role in workload account'

inputs:
  aws_region:
    description: 'AWS region'
    required: true
  oidc_role_to_assume:
    description: 'Base role to assume via GitHub OIDC (in Management account)'
    required: true
  target_role_to_assume:
    description: 'Target deployment role to assume in workload account (chained)'
    required: true
  base_session_name:
    description: 'Session name for base OIDC auth'
    default: 'OIDC-Auth'
  target_session_name:
    description: 'Session name for target role'
    default: 'Chained-Role'

runs:
  using: 'composite'
  steps:
    # Step 1: Authenticate to Management account via OIDC
    - name: '🔐 Configure AWS credentials (OIDC)'
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ inputs.oidc_role_to_assume }}
        role-session-name: GitHubActions-${{ inputs.base_session_name }}
        aws-region: ${{ inputs.aws_region }}

    # Step 2: Chain to the target deployment role in workload account
    - name: '🔐 Configure AWS credentials (Chained Target Role)'
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: ${{ inputs.target_role_to_assume }}
        role-session-name: GitHubActions-${{ inputs.target_session_name }}
        aws-region: ${{ inputs.aws_region }}
        role-chaining: true  # This is the key!
```

### Using It in a Workflow

Here's a simplified version of a static site deployment workflow:

```yaml
name: 'CI/CD Pipeline'

on:
  push:
    branches: [main, dev, release/*, feature/*]

permissions:
  id-token: write   # Required for OIDC
  contents: read

env:
  # Management account hosts the OIDC provider
  MANAGEMENT_ACCOUNT_ID: "111111111111"
  # Production account is the deployment target
  PRODUCTION_ACCOUNT_ID: "999999999999"

jobs:
  deploy:
    name: 'Deploy Static Site'
    runs-on: ubuntu-latest
    environment: production  # GitHub Environment for approval gates
    
    steps:
      - name: '📥 Checkout code'
        uses: actions/checkout@v4

      # Two-step authentication: OIDC (Management) → Role Chain (Production)
      - name: '🔐 Configure AWS credentials (Chained)'
        uses: ./.github/actions/configure-aws-credentials-chained
        with:
          aws_region: us-west-2
          # Step 1: Authenticate to Management account
          oidc_role_to_assume: arn:aws:iam::${{ env.MANAGEMENT_ACCOUNT_ID }}:role/GitHubActionsOIDCRole
          # Step 2: Chain to Production account
          target_role_to_assume: arn:aws:iam::${{ env.PRODUCTION_ACCOUNT_ID }}:role/frontend-app-deployment-role
          base_session_name: OIDC-Auth
          target_session_name: StaticSite-production

      # Verify we're in the right account (should show Production account)
      - name: '✅ Verify AWS connection'
        run: |
          echo "Connected to AWS Account: $(aws sts get-caller-identity --query Account --output text)"
          echo "Role ARN: $(aws sts get-caller-identity --query Arn --output text)"

      # Deploy!
      - name: '🚀 Sync to S3'
        run: |
          aws s3 sync . s3://my-website-bucket/ --delete
```

## The Critical Permission: `id-token: write`

One thing that trips people up initially: you **must** set `id-token: write` in your workflow permissions:

```yaml
permissions:
  id-token: write   # This is required for OIDC!
  contents: read
```

Without this, GitHub won't generate the OIDC token, and you'll get cryptic "not authorized to perform sts:AssumeRoleWithWebIdentity" errors.

## Branch-to-Environment Mapping

Map branches to environments (and their corresponding workload accounts) automatically:

```yaml
env:
  MANAGEMENT_ACCOUNT_ID: "111111111111"
  SANDBOX_ACCOUNT_ID: "222222222222"
  DEVELOPMENT_ACCOUNT_ID: "333333333333"
  STAGING_ACCOUNT_ID: "444444444444"
  PRODUCTION_ACCOUNT_ID: "999999999999"

# ...

- name: 'Map branch to environment'
  id: env-mapping
  run: |
    case "${{ github.ref_name }}" in
      "main")
        echo "environment=production" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.PRODUCTION_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "dev")
        echo "environment=development" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.DEVELOPMENT_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "release/"*)
        echo "environment=staging" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.STAGING_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
      "feature/"*)
        echo "environment=sandbox" >> $GITHUB_OUTPUT
        echo "account_id=${{ env.SANDBOX_ACCOUNT_ID }}" >> $GITHUB_OUTPUT
        ;;
    esac
```

This integrates with OIDC beautifully—you can even scope your trust policy to specific branches:

```hcl
# Only allow production deployments from main branch
StringEquals = {
  "${local.github_oidc_condition_key}:sub" = "repo:acme-corp/backend-api:ref:refs/heads/main"
}
```

## Debugging OIDC Issues

When things go wrong (and they will during setup), here's how to debug:

### 1. Check the OIDC Token Claims

Add this step to see what GitHub is sending:

```yaml
- name: '🔍 Debug OIDC Token'
  run: |
    # The token is available in this environment variable
    echo "Token Preview (first 50 chars): ${ACTIONS_ID_TOKEN_REQUEST_TOKEN:0:50}..."
    
    # Decode the JWT (middle part) to see claims
    # Don't do this in production logs!
```

### 2. Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Missing `id-token: write` permission | Add it to workflow permissions |
| `Invalid identity token` | Wrong OIDC thumbprint | Verify you're using GitHub's current thumbprint |
| `Condition not satisfied` | `sub` claim doesn't match | Check your repository pattern in the trust policy |
| `Invalid principal in policy` | Wrong OIDC provider ARN | Verify the federated principal ARN |
| `Access denied assuming role in workload account` | Trust policy doesn't allow Management account | Verify the workload account role trusts the OIDC role ARN |

### 3. Verify Your Trust Policy

Test your trust policy conditions locally:

```bash
# Decode a sample GitHub OIDC token to see the actual claims
# The 'sub' claim will look like: repo:ORG/REPO:ref:refs/heads/BRANCH
```

## Security Best Practices

After implementing this across repositories, here are the practices to adopt:

### 1. Scope Trust Policies Narrowly

```hcl
# ❌ Too permissive - any branch
"repo:acme-corp/backend-api:*"

# ✅ Better - specific branches only
"repo:acme-corp/backend-api:ref:refs/heads/main"
"repo:acme-corp/backend-api:ref:refs/heads/dev"
```

### 2. Use Repository-Specific Roles

Don't give every repository the same permissions:

```hcl
# Static website repo - only needs S3 and CloudFront
resource "aws_iam_role" "frontend_deployment_role" { ... }

# API repo - needs ECS, Lambda, RDS, etc.
resource "aws_iam_role" "backend_api_deployment_role" { ... }

# Infrastructure repo - needs Terraform admin permissions
resource "aws_iam_role" "infrastructure_deployment_role" { ... }
```

### 3. Use GitHub Environments for Approval Gates

```yaml
jobs:
  deploy-production:
    environment: production  # Requires approval before running
```

Configure required reviewers in GitHub repository settings for the `production` environment.

### 4. Lock Down the Management Account

Since the Management account is the gateway to all workload accounts:
- Restrict who can modify IAM roles in this account
- Enable CloudTrail logging for all OIDC events
- Use AWS Organizations SCPs to prevent accidental changes
- Consider using AWS IAM Access Analyzer to audit trust policies

### 5. Monitor with CloudTrail

Every OIDC authentication creates CloudTrail events with:
- The GitHub repository
- The workflow name
- The actor who triggered it
- The session name you specified

This makes incident investigation dramatically easier.

## The Results: Before and After

### Security Improvements

| Metric | Before | After |
|--------|--------|-------|
| Credential lifetime | Indefinite | 15 minutes |
| Credential storage | CI/CD env vars, secret managers | None (generated on demand) |
| Rotation frequency | "When we remember" | Every workflow run |
| Repository scoping | None | Per-repository trust |
| Audit trail | "CI/CD User" | Full repo/branch/actor info |
| Identity management | Scattered | Centralized in Management account |

### Operational Improvements

- **Zero credential rotation tasks** - It's automatic
- **No credential sprawl** - Nothing to manage or leak
- **Easier debugging** - CloudTrail shows exactly which repo/workflow did what
- **Simpler onboarding** - New repos just need trust policy updates
- **Clear security boundary** - Management account isolated from workloads

## Wrapping Up

Migrating to GitHub OIDC is one of the best security decisions you can make during a GitHub Actions migration. Yes, the initial setup requires understanding JWT claims, trust policies, and role chaining. But once it's in place:

- **No more credential rotation anxiety**
- **No more "who has access to these keys?"**
- **No more credentials in environment variables**

Using a dedicated Management account for OIDC authentication follows AWS best practices and provides a clean separation between identity management and your workload accounts. If you're still using long-lived AWS credentials in your CI/CD pipelines, I hope this post gives you the roadmap to make the switch. The investment is worth it.

The hardest part isn't the technical implementation—it's convincing yourself that the temporary complexity of setting this up is worth the permanent simplification of not managing credentials anymore.

---

*Questions about implementing OIDC for your setup? Find me on [LinkedIn](https://linkedin.com/in/carimfadil).*
