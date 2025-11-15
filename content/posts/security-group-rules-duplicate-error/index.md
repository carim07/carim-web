---
title: "Breaking Circular Dependencies: The Hidden Cost of Terraform Security Group Refactoring"
date: 2025-11-15T10:00:00-07:00
lastmod: 2025-11-15T10:00:00-07:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "How refactoring AWS Security Group rules to fix circular dependencies creates duplicate resource errors, and why Terraform's import blocks can't save you."

tags: ["Terraform", "AWS", "Security Groups", "DevOps", "IaC", "ECS", "ALB"]
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

Sometimes the best solution to a problem creates a new problem you didn't expect. This is a story about fixing one Terraform error, only to discover that the fix itself introduces a whole new class of deployment challenges.

<!--more-->

## The Setup

We had a straightforward architecture: an Application Load Balancer (ALB) forwarding traffic to an ECS service running our API. The security groups were configured to allow traffic flow between them. Nothing fancy, just standard AWS infrastructure.

Then came the Terraform validation error:

```
Error: Cycle: aws_security_group.alb_sg, aws_security_group.api_service_sg
```

A **circular dependency**. The ALB security group referenced the ECS security group, and vice versa. Terraform couldn't determine which one to create first.

## The Problem: Circular Dependencies

Here's what the original code looked like:

```hcl
# ALB Security Group
resource "aws_security_group" "alb_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_alb_sg_${local.namespace}"

  # Egress to ECS service
  egress {
    description     = "Forward traffic to ECS service on port 3000"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.api_service_sg.id]  # ← References ECS SG
  }
}

# ECS Service Security Group
resource "aws_security_group" "api_service_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_api_service_sg_${local.namespace}"

  # Ingress from ALB
  ingress {
    description     = "Allow traffic from ALB SG on port 3000"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]  # ← References ALB SG
  }
}
```

The cycle is clear:
- ALB security group needs the ECS security group ID for its egress rule
- ECS security group needs the ALB security group ID for its ingress rule
- Terraform: "I can't create either one first!" 🤯

### Visualizing the Circular Dependency

{{< mermaid >}}
flowchart LR
    ALB[aws_security_group.alb_sg]
    ECS[aws_security_group.api_service_sg]
    
    ALB -->|egress rule references| ECS
    ECS -->|ingress rule references| ALB
    
    style ALB fill:#FFB6C1,stroke:#8B0000,color:#000
    style ECS fill:#FFB6C1,stroke:#8B0000,color:#000
    
    Note["Terraform Error: Cycle detected!"]
    style Note fill:#FFE4B5,stroke:#8B4513,color:#000
{{< /mermaid >}}

## The Standard Solution: Separate Security Group Rules

This is a well-documented pattern in the Terraform community. Instead of defining rules inline within the security group resource, you extract them into separate `aws_security_group_rule` resources:

```hcl
# ALB Security Group (no inline rules)
resource "aws_security_group" "alb_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_alb_sg_${local.namespace}"
  
  # No egress rules defined inline
}

# ECS Service Security Group (no inline rules)
resource "aws_security_group" "api_service_sg" {
  vpc_id = var.VPC_ID
  name   = "${var.project}_api_service_sg_${local.namespace}"
  
  # No ingress rules defined inline
}

# Separate rule: ALB → ECS egress
resource "aws_security_group_rule" "alb_egress_to_ecs" {
  type                     = "egress"
  description              = "Forward traffic to ECS service on port 3000"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.alb_sg.id
  source_security_group_id = aws_security_group.api_service_sg.id
}

# Separate rule: ECS ← ALB ingress
resource "aws_security_group_rule" "ecs_ingress_from_alb" {
  type                     = "ingress"
  description              = "Allow traffic from ALB SG on port 3000"
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  security_group_id        = aws_security_group.api_service_sg.id
  source_security_group_id = aws_security_group.alb_sg.id
}
```

**Why this works:**

1. Both security groups are created first (with no rules)
2. Then the separate rule resources are created
3. The rules can reference both security groups because they already exist
4. No circular dependency!

### The Fixed Architecture

{{< mermaid >}}
flowchart TB
    subgraph "Phase 1: Create Security Groups"
        ALB1[aws_security_group.alb_sg]
        ECS1[aws_security_group.api_service_sg]
        
        style ALB1 fill:#90EE90,stroke:#2d5016,color:#000
        style ECS1 fill:#90EE90,stroke:#2d5016,color:#000
    end
    
    subgraph "Phase 2: Create Rules"
        RULE1[aws_security_group_rule.alb_egress_to_ecs]
        RULE2[aws_security_group_rule.ecs_ingress_from_alb]
        
        RULE1 -->|references| ALB1
        RULE1 -->|references| ECS1
        RULE2 -->|references| ALB1
        RULE2 -->|references| ECS1
        
        style RULE1 fill:#90EE90,stroke:#2d5016,color:#000
        style RULE2 fill:#90EE90,stroke:#2d5016,color:#000
    end
{{< /mermaid >}}

Perfect! We committed the fix, merged to `develop`, and triggered the deployment pipeline.

Then came the error that prompted this entire investigation.

## The New Problem: Duplicate Rules

```
Error: [WARN] A duplicate Security Group rule was found on (sg-0123456789abcdef0).
Error: operation error EC2: AuthorizeSecurityGroupIngress, 
https response error StatusCode: 400, RequestID: 34a71c7a-d5ee-464c-aa7a-cd9c70bcd8f6,
api error InvalidPermission.Duplicate: the specified rule 
"peer: sg-0fedcba9876543210, TCP, from port: 3000, to port: 3000, ALLOW" 
already exists

  with aws_security_group_rule.ecs_ingress_from_alb,
  on service.tf line 79, in resource "aws_security_group_rule" "ecs_ingress_from_alb":
  79: resource "aws_security_group_rule" "ecs_ingress_from_alb" {
```

Wait, what? The rule *already exists*? But we just defined it as a new resource!

### What Actually Happened

Here's the thing about inline security group rules versus separate `aws_security_group_rule` resources: **they both create the same thing in AWS**.

When you define a rule inline:
```hcl
resource "aws_security_group" "example" {
  ingress {
    from_port = 3000
    to_port   = 3000
    protocol  = "tcp"
    security_groups = [aws_security_group.other.id]
  }
}
```

AWS creates a security group rule. Terraform manages it as part of the security group resource.

When you define a rule separately:
```hcl
resource "aws_security_group_rule" "example" {
  security_group_id        = aws_security_group.example.id
  from_port                = 3000
  to_port                  = 3000
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.other.id
}
```

AWS creates... the exact same security group rule. Terraform manages it as a separate resource.

**The problem:** When we refactored from inline to separate rules, the actual rules already existed in AWS (created by the inline configuration). Our new code tried to create them again as separate resources, and AWS said "nope, those rules already exist!"

### The State Management Issue

This is fundamentally a **Terraform state migration problem**, not an AWS problem. Let's trace what happened:

{{< mermaid >}}
sequenceDiagram
    participant Dev as Developer
    participant TF as Terraform
    participant State as Terraform State
    participant AWS as AWS

    Note over Dev,AWS: Before Refactoring
    Dev->>TF: terraform apply (inline rules)
    TF->>AWS: Create security groups with inline rules
    AWS->>AWS: Creates sg-xxx with rules
    TF->>State: Track as aws_security_group resources

    Note over Dev,AWS: After Code Refactoring
    Dev->>TF: terraform plan (separate rules)
    TF->>State: Check state
    State-->>TF: Security groups exist (inline rules tracked)
    TF->>TF: Compare with new code
    Note over TF: New code defines<br/>aws_security_group_rule<br/>resources
    TF->>Dev: Plan: Create new rule resources

    Dev->>TF: terraform apply
    TF->>AWS: Create security group rule
    AWS-->>TF: ERROR: Rule already exists!
    
    Note over Dev,AWS: State thinks rules are inline,<br/>AWS has the actual rules,<br/>New code wants separate resources
{{< /mermaid >}}

The state file still tracks the rules as part of the security group resources (inline), but the new code defines them as separate resources. Terraform doesn't realize they're the same thing.

## Attempted Solution #1: Import Blocks

My first instinct was to use Terraform's import blocks (available in Terraform 1.2+). The idea was to tell Terraform: "Hey, these separate rule resources you're trying to create? They already exist. Just import them into state."

```hcl
import {
  to = aws_security_group_rule.ecs_ingress_from_alb
  id = "${aws_security_group.api_service_sg.id}_ingress_tcp_3000_3000_${aws_security_group.alb_sg.id}"
}

resource "aws_security_group_rule" "ecs_ingress_from_alb" {
  # ... configuration ...
}
```

Elegant! Declarative! Should work perfectly, right?

### Why Import Blocks Failed

**Problem #1: Circular Dependency (Again!)**

The import block ID references both security groups:
- File A's import block references `aws_security_group.alb_sg.id` (from File B)
- File B's import block references `aws_security_group.api_service_sg.id` (from File A)

We're back to a circular dependency! The very problem we were trying to fix.

**Attempted Fix: Use Data Sources**

```hcl
data "aws_security_group" "existing_alb_sg_for_import" {
  name = "${var.project}_alb_sg_${local.namespace}"
}

import {
  to = aws_security_group_rule.ecs_ingress_from_alb
  id = "${data.aws_security_group.existing_ecs_sg.id}_ingress_tcp_3000_3000_${data.aws_security_group.existing_alb_sg.id}"
}
```

This broke the circular dependency by using independent data source lookups instead of resource references.

**Problem #2: Import Blocks Don't Support Computed Values**

```
Error: cannot use computed values in import block ID
```

Terraform's import blocks require **literal string values** known at plan time. You can't use:
- Data source attributes (computed at apply time)
- Resource attributes (computed at apply time)  
- Any interpolation that isn't a simple variable

The import ID must be a hardcoded string or a simple variable. No dynamic lookups allowed.

### The Cursor Bot's Helpful Comment

When I opened a PR with the import block solution, Cursor's bot immediately flagged it:

> **Bug: Cyclic Imports Break Terraform Plan**
>
> The import block creates a circular dependency with the import block in `load_balancer.tf`. This import references `aws_security_group.alb_sg.id` from the load balancer file, while that file's import references `aws_security_group.api_service_sg.id` from this file. Terraform will fail with a cycle error when evaluating these interdependent import block IDs during the plan phase.

And after trying the data source approach:

> The import block uses data source attributes in the id field, but Terraform import blocks cannot use computed values - they require literal strings or values known at plan time. This will cause a "cannot use computed values" error during terraform plan.

Props to the bot for catching these issues before they hit the actual deployment! 🤖

## The Real Solution: Manual State Migration

After all the attempts to automate this with import blocks, the reality is simpler (and somewhat anticlimactic): **just handle the one-time migration manually**.

You have two options:

### Option 1: Manual Deletion (Simplest)

This is what I did in the `dev` environment, and it worked perfectly:

1. Open AWS Console → EC2 → Security Groups
2. Find the ECS service security group
3. Delete the ingress rule from ALB on port 3000
4. Find the ALB security group
5. Delete the egress rule to ECS on port 3000
6. Run `terraform apply` - it creates them as separate resources

**Time:** ~2 minutes  
**Risk:** Zero (rules are immediately recreated)  
**Downtime:** None (rules exist continuously)

### Option 2: Manual Import Command

If you prefer the terraform way:

```bash
# Look up the security group IDs
terraform state show 'aws_security_group.api_service_sg'
terraform state show 'aws_security_group.alb_sg'

# Import the rules (using actual IDs)
terraform import \
  'aws_security_group_rule.ecs_ingress_from_alb' \
  'sg-0123456789abcdef0_ingress_tcp_3000_3000_sg-0fedcba9876543210'

terraform import \
  'aws_security_group_rule.alb_egress_to_ecs' \
  'sg-0fedcba9876543210_egress_tcp_3000_3000_sg-0123456789abcdef0'

# Then apply normally
terraform apply
```

## Why "Just Delete Them" is Actually Fine

I initially hesitated to recommend manual deletion because it felt like working around infrastructure-as-code principles. But here's why it's actually the right approach:

### 1. It's a One-Time Migration

This isn't an ongoing operational task. You refactor from inline to separate rules once per security group. After that, everything works normally.

### 2. Zero Risk

The worst case scenario:
- You delete the rules in AWS
- Terraform apply fails for some reason
- The rules are missing for a few minutes until you debug and reapply

But in reality:
- The apply happens immediately after deletion
- The rules are recreated in seconds
- No actual traffic disruption (connections are established, not rule-checked continuously)

### 3. It's Actually Faster

- Manual deletion: 2 minutes
- Setting up import with all variables: 15+ minutes
- Debugging import errors: 30+ minutes
- Writing automation scripts: Hours

### 4. No Downtime Even If You Don't Delete

Here's something important I discovered: **if you don't delete the rules and just try to apply, nothing breaks**.

The Terraform apply fails with the duplicate rule error, but:
- ✅ The existing rules stay in place
- ✅ Traffic continues flowing normally
- ✅ No service disruption
- ❌ Just a Terraform error you need to fix

So the "failure" is really just Terraform being unable to complete the apply. Your infrastructure keeps working fine.

This means you can safely:
1. Try the apply in production
2. See the duplicate error
3. Manually delete the rules
4. Re-run the apply

No emergency, no incident, no pressure.

## Key Takeaways

1. **Circular dependencies in security groups are common** - the separate rule pattern is well-established for a reason

2. **Refactoring inline rules to separate resources is a state migration**, not just a code change

3. **Import blocks have strict limitations**:
   - Can't use computed values
   - Can't use data source attributes
   - Can't reference resource attributes
   - Require literal string IDs

4. **Sometimes the manual approach is correct** - not everything needs to be automated, especially one-time migrations

5. **Terraform apply failures aren't always production incidents** - in this case, the failure is safe and expected

6. **The "duplicate rule" error has zero impact on running services** - your infrastructure keeps working while you fix Terraform's state

## What About Future Refactorings?

The lesson here isn't "never refactor security groups." It's understanding the **migration path** when you do:

- **Planning to refactor inline → separate rules?**  
  Document the manual deletion step as part of the deployment plan.

- **Using separate rules from the start?**  
  No migration needed! You avoid this entire problem.

- **Already have inline rules?**  
  Consider whether the circular dependency is actually causing you problems. If not, maybe leave it alone.

## References

- [Terraform Import Block Documentation](https://developer.hashicorp.com/terraform/language/import)
- [AWS Security Group Rules Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html)

## Wrapping Up

This investigation taught me that not every infrastructure problem has—or needs—an automation solution. Sometimes the best answer is:

1. Understand the root cause
2. Document the manual steps
3. Execute them once per environment
4. Move on with your life

The security group rules now work correctly across all environments. The circular dependency is fixed. And I learned some valuable lessons about Terraform's import block limitations.

---

*Have you hit similar Terraform state migration issues? I'd love to hear how you handled them. Find me on [LinkedIn](https://linkedin.com/in/carimfadil).*

