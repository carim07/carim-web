---
title: "How AI Transformed My Workflow as a Senior DevOps Engineer"
date: 2025-11-19T10:00:00-00:00
lastmod: 2025-11-19T10:00:00-00:00
draft: false
author: "Carim Fadil"
authorLink: "https://carim.ar"
description: "A reflection on how my DevOps workflow has evolved over the past year, shifting from manual coding to AI-assisted architecture, planning, and code review."

tags: ["DevOps", "AI", "Cursor", "Workflow", "Productivity", "Software Development"]
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

Six months ago, if you'd told me that I'd spend most of my time architecting and reviewing code instead of writing it, I would have been skeptical. Yet here we are. My workflow as a Senior DevOps Engineer has fundamentally transformed, and AI has been the catalyst.

This isn't just about using a new tool—it's about a complete shift in how I approach problem-solving, planning, and execution. Let me walk you through what changed.

<!--more-->

## The Before: Traditional DevOps Workflow

My workflow used to follow the standard DevOps lifecycle pattern:

{{< mermaid >}}
flowchart TD
    Start([Start Task]) --> Investigate["Investigation & Planning"]
    Investigate --> Google[Google Search]
    Investigate --> StackOverflow[Stack Overflow]
    Investigate --> Docs["AWS/Terraform/Kubernetes Docs<br/>(Deep Reading)"]
    Investigate --> Trial["Trial & Error"]
    
    Google --> Plan["Plan"]
    StackOverflow --> Plan
    Docs --> Plan
    Trial --> Plan
    
    Plan --> Code["Code"]
    Code --> VSCode[VS Code Editor]
    VSCode --> Manual[Manual Coding]
    Manual --> Copilot["GitHub Copilot - Basic Autocomplete"]
    
    Copilot --> CICD["CI/CD Pipeline"]
    CICD --> Build["Build"]
    Build --> Test["Test"]
    Test --> Release["Release"]
    Release --> Deploy["Deploy"]
    
    Deploy --> Monitor["Monitor"]
    Monitor --> CloudWatch["CloudWatch/Prometheus/Grafana"]
    
    Code --> Tasks["Task Management"]
    Tasks --> ManualJira[Manual Jira Tickets]
    Tasks --> ManualDocs[Manual PR Docs]
    
    CICD --> Review["Code Review"]
    Review --> HumanReview[Human Reviewers]
    Review --> AutomatedChecks["Linting, Terraform Validate,<br/>Static Code Analysis"]
    
    HumanReview --> Done([Done])
    AutomatedChecks --> Done
    CloudWatch --> Done
    
    style Investigate fill:#FFE4B5,stroke:#333,color:#000
    style Plan fill:#FFB6C1,stroke:#333,color:#000
    style Code fill:#FFB6C1,stroke:#333,color:#000
    style CICD fill:#87CEEB,stroke:#333,color:#000
    style Monitor fill:#DDA0DD,stroke:#333,color:#000
    style Tasks fill:#E0E0E0,stroke:#333,color:#000
    style Review fill:#DDA0DD,stroke:#333,color:#000
    style Manual fill:#FF6B6B,stroke:#333,color:#000
    style Done fill:#90EE90,stroke:#333,color:#000
{{< /mermaid >}}

### Investigation & Planning: The Documentation Deep Dive

This phase was where I spent a disproportionate amount of time. Before even starting to plan the solution, I had to:

- **Deep documentation reading**: Spending hours reading AWS, Terraform, Kubernetes, or other platform documentation—not just the high-level overview, but diving deep into:
  - Exact syntax and parameter formats
  - All available options and their implications
  - Edge cases and limitations
  - Examples and use cases
  
- **Google searches** for error messages, solutions, and best practices
- **Stack Overflow deep dives** to understand how others solved similar problems
- **Manual trial and error** to validate understanding
- **Planning** after gathering all this information

**The time sink**: A significant portion of my time went into understanding the minutiae of implementation details—the exact parameters a Terraform resource accepts, the specific format of a CloudFormation template, the precise flags for a CLI command. This was necessary, but it slowed down the actual problem-solving and architecture work.

### Code: Manual Development

- **VS Code** as my primary editor
- **AI-assisted autocomplete** (GitHub Copilot) for basic suggestions
- **Mostly manual coding** with occasional AI help
- Writing code line by line, function by function
- Still referencing documentation frequently during coding

### Build, Test, Release, Deploy: The CI/CD Pipeline

Once code was committed, the CI/CD pipeline automatically handled:

- **Build**: Compiling code, building Docker images, packaging Lambda functions
- **Test**: Running unit tests, integration tests, security scans
- **Release**: Preparing artifacts for deployment, tagging versions
- **Deploy**: Deploying to staging and production environments (often with manual approval gates)

This part was well-automated, but the coding phase that fed into it was still largely manual.

### Monitor: Observability and Alerting

Post-deployment monitoring was handled by:

- **CloudWatch** for AWS resource metrics, logs, and alarms
- **Prometheus/Grafana** for custom metrics and dashboards
- **Other monitoring tools** depending on the environment
- Manual investigation when alerts fired

### Task Management & Code Review

- **Manual Jira ticket creation** and updates
- **Manual documentation** in PRs and tickets
- **Manual PR reviews** with human reviewers focusing on everything from syntax to architecture
- Basic automated checks (linting, basic security scans, static analysis)

### The Challenge: Time Distribution

This workflow worked, but the time distribution was problematic:

- **40-50% of time**: Reading documentation, understanding syntax and parameters
- **30-40% of time**: Writing code
- **10-20% of time**: Architecture, planning, and understanding system integrations
- **5-10% of time**: Code review and refinement

The majority of my time was spent on implementation details rather than on the higher-value work of architecture, planning, and understanding the big picture.

## The Now: AI-Powered DevOps Workflow

Fast forward to today, and my workflow looks completely different:

{{< mermaid >}}
flowchart TD
    Start([Start Task]) --> Plan["AI-Assisted Planning"]
    Plan --> Markdown[Markdown Planning Docs]
    Plan --> AIExplore[AI Problem Exploration]
    Plan --> StructuredPlan[Structured Task Breakdown]
    
    Plan --> Investigate["AI-Assisted Investigation"]
    Investigate --> CursorAsk[Cursor Ask Mode]
    Investigate --> AWSCLI["AI + AWS CLI"]
    Investigate --> OtherCLIs["AI + Other CLIs"]
    
    Investigate --> Develop["AI-Powered Development"]
    Develop --> Cursor[Cursor IDE]
    Cursor --> AILibrary["AI Library - Prompts & Patterns"]
    Cursor --> PlanMode[Plan Mode]
    Cursor --> CodeGen[Intelligent Code Gen]
    
    Develop --> Tasks["Automated Task Management"]
    Tasks --> MCPs["MCPs: Jira, GitHub, etc."]
    Tasks --> GHCLI["GitHub CLI + AI"]
    Tasks --> AutoDocs[Auto Documentation]
    
    Develop --> Review["Multi-Layer Review"]
    Review --> Bugbot[Bugbot]
    Review --> CodeQL[CodeQL Scanning]
    Review --> CursorReview[Cursor PR Review]
    Review --> HumanReview["Human Review - High-Level Focus"]
    
    Review --> Done([Done])
    HumanReview --> Done
    
    style Plan fill:#90EE90,stroke:#333,color:#000
    style Investigate fill:#87CEEB,stroke:#333,color:#000
    style Develop fill:#DDA0DD,stroke:#333,color:#000
    style Tasks fill:#FFD700,stroke:#333,color:#000
    style Review fill:#FFA07A,stroke:#333,color:#000
    style Done fill:#90EE90,stroke:#333,color:#000
    style CursorAsk fill:#FFE4B5,stroke:#333,color:#000
    style AWSCLI fill:#FFE4B5,stroke:#333,color:#000
{{< /mermaid >}}

### Investigation: AI-Assisted Discovery

- **Cursor's Ask mode** for deep technical investigations
  - Ask complex questions about AWS services, Terraform patterns, or architecture decisions
  - Get contextual answers based on my codebase and documentation
  - Follow-up questions to dive deeper into specific topics

- **AI-assisted CLI exploration** (AWS CLI, Terraform CLI, kubectl, etc.)
  - Use AI to help construct complex CLI queries and commands
  - Understand resource relationships and dependencies across cloud providers
  - Debug infrastructure issues with AI-guided investigation
  - Generate and validate CLI commands before execution
  - Learn new CLI tools faster with AI assistance

### Development: From Coding to Architecting

- **Cursor** as my primary IDE (replacing VS Code)
  - More intelligent code generation and understanding
  - Better context awareness across the entire codebase
  - Seamless integration with AI workflows

- **AI Library**: A curated collection of prompts, coding patterns, and best practices
  - **Golden examples** of common patterns (Terraform modules, Lambda functions, etc.)
  - **Software development lifecycle** documentation
  - **Agent modes** for different types of tasks (investigation, planning, coding, review)
  - Reusable prompts that capture my team's standards and preferences

- **Planning-first approach**:
  - **Plan mode** or custom prompts to architect solutions before coding
  - **Markdown planning documents** for large projects with multiple tasks
  - Break down complex problems into manageable, well-defined steps
  - AI helps identify edge cases and potential issues early

- **Shift in focus**: 
  - **Less manual coding**, more architecture and design
  - **More code review** and refinement
  - **Manual coding only when AI doesn't get it right** (which is becoming less frequent)

### Task Management: Automated Documentation

- **MCPs (Model Context Protocol)** for automated task management
  - Automatically create and update Jira tickets
  - Generate task descriptions and acceptance criteria
  - Link related tasks and track dependencies

- **GitHub CLI integration** with AI
  - Automatically generate PR descriptions
  - Create comprehensive changelogs
  - Document decisions and trade-offs

- **Markdown documentation** for planning
  - Large projects get detailed markdown planning docs
  - AI helps structure and organize complex initiatives
  - Living documents that evolve as the project progresses

### Code Review: Multi-Layer AI Assistance

- **Automated PR reviews** with multiple tools:
  - **Bugbot** for bug detection and code quality
  - **CodeQL Scanning** for security vulnerabilities
  - **Cursor PR review** for architecture and best practices

- **Manual reviews remain**, but now:
  - Focus on high-level architecture and business logic
  - AI handles the tedious checks (formatting, common bugs, security issues)
  - Reviewers can focus on what matters most

## The Paradigm Shift: From Documentation Experts to Architecture Experts

The most profound change isn't about the tools—it's about where I spend my cognitive energy. The shift from reading detailed documentation to AI-assisted development has fundamentally changed what it means to be a senior engineer.

### Before: Documentation Deep Dives

Previously, being a good engineer meant:
- Reading and memorizing extensive documentation
- Understanding every parameter, option, and syntax detail
- Keeping mental models of complex APIs and configurations
- Referencing documentation constantly during development

This was necessary but time-consuming. I'd spend hours reading AWS documentation, Terraform provider docs, Kubernetes API references—not to understand the concepts, but to understand the exact implementation details.

### Now: High-Level Understanding + AI Assistance

Today, my approach has fundamentally changed:

**I read and understand the high-level architecture and concepts**, and I leave the implementation details—the exact syntax, the specific parameters, the precise configuration format—to AI.

#### What This Looks Like in Practice

When I need to implement something new:

1. **High-level understanding**: I read the architectural overview, understand the service's purpose, how it integrates with other systems, its limitations, and its cost implications.

2. **AI handles the details**: The AI generates the code with the correct:
   - Syntax and formatting
   - Required and optional parameters
   - Best practices and patterns
   - Error handling and edge cases

3. **I review and validate**: I assess whether the solution is architecturally sound, secure, and appropriate for the use case.

#### "But AI Gets It Wrong Sometimes..."

Yes, AI makes mistakes. It might use deprecated syntax, misunderstand a requirement, or hallucinate parameters that don't exist.

**And that's okay.**

Why? Because it's **faster to correct a syntax error than to read the entire documentation yourself**.

Think about it:
- **Before**: Spend 30-60 minutes reading documentation → Write code → Maybe introduce a bug → Debug
- **Now**: Spend 5 minutes understanding the concept → AI generates code → Review takes 10 minutes → Correct any mistakes (caught by AI, automation, or manual review) → Deploy

Even when AI gets it wrong, the correction is quick:
- Linters and automated tests catch syntax errors immediately
- AI-assisted code review catches logical errors
- Manual review catches architectural issues

The time saved on documentation reading far outweighs the time spent correcting AI mistakes.

### Where Human Expertise Still Matters (A Lot)

This doesn't mean we can become lazy or stop learning. In fact, **the bar for what matters has gone up**:

#### Critical Skills for the AI Era

1. **Architecture and System Design**
   - Understanding how systems integrate and communicate
   - Designing scalable, resilient architectures
   - Making trade-offs between different approaches

2. **Security and Compliance**
   - Understanding security principles and threat models
   - Reviewing AI-generated code for security vulnerabilities
   - Ensuring compliance with regulations and standards

3. **Networking and Infrastructure**
   - Understanding how networks, load balancers, and DNS work
   - Debugging complex infrastructure issues
   - Designing network architectures

4. **Code Quality and Patterns**
   - Assessing whether AI-generated code is good, maintainable, and follows best practices
   - Understanding appropriate design patterns for specific problems
   - Identifying code smells and potential pitfalls

5. **Problem Analysis**
   - Understanding **WHAT** needs to be built
   - Determining **WHEN** it needs to be built and in what order
   - Analyzing **costs** and **ROI**
   - Weighing **pros and cons** of different implementation approaches
   - Identifying risks and dependencies

6. **Business Context**
   - Understanding the business problem being solved
   - Aligning technical solutions with business goals
   - Communicating trade-offs to stakeholders

#### The New Time Distribution

With AI assistance, my time distribution has flipped:

- **5-10% of time**: Understanding implementation syntax and details (AI handles this)
- **10-15% of time**: Writing and reviewing code
- **50-60% of time**: Architecture, planning, and understanding system integrations
- **15-20% of time**: Understanding requirements, costs, trade-offs, and business context
- **10-15% of time**: Validation, testing, and quality assurance

**The work is now about understanding the problem deeply, not implementing the solution manually.**

### The Smart Assistant Analogy

Think of AI as a highly capable assistant:

- **Before**: You had to do everything yourself, including all the tedious research and implementation work
- **Now**: You have an assistant who can research, draft, and implement—but needs your guidance and review

If you guide this assistant properly:
- Provide clear requirements and context
- Review the output critically
- Correct mistakes and refine the solution
- Validate that it solves the right problem

You can produce **higher quality work, faster**, while focusing your energy on the parts that truly require human expertise and judgment.

### The Reality Check

Let me be clear: **You still need to be able to read and write code.** You still need to understand what good code looks like, what security vulnerabilities exist, how systems scale, and how networks operate.

The difference is that you're not spending your time **memorizing** every parameter of every API or **writing** every line of code yourself. Instead, you're:
- **Guiding** AI to produce the right solution
- **Reviewing** AI-generated code critically
- **Architecting** systems that are secure, scalable, and maintainable
- **Solving** complex problems that require creativity and expertise

**AI hasn't lowered the bar—it's raised it.** The expectation is now that you can move faster, build more, and focus on higher-level problems. The engineers who thrive are those who can leverage AI effectively while maintaining deep expertise in the areas that matter most.

### The Most Important Change: AI-Assisted Planning

If I had to pick one change that's had the biggest impact, it's **AI-assisted planning**. 

{{< mermaid >}}
flowchart TB
    subgraph Before["Before: Manual Planning"]
        direction LR
        B1[Problem] --> B2[Manual Research] --> B3[Quick Planning] --> B4[Start Coding] --> B5[Discover Issues] --> B6[Fix & Rework]
        
        style B1 fill:#FFB6C1,stroke:#333,color:#000
        style B2 fill:#FFB6C1,stroke:#333,color:#000
        style B3 fill:#FFB6C1,stroke:#333,color:#000
        style B4 fill:#FFB6C1,stroke:#333,color:#000
        style B5 fill:#FFB6C1,stroke:#333,color:#000
        style B6 fill:#FF6B6B,stroke:#333,color:#000
    end
    
    Before ==>|"AI-Assisted Evolution"| After
    
    subgraph After["Now: AI-Assisted Planning"]
        direction LR
        A1[Problem] --> A2[AI Explore Problem Space] --> A3[Generate Structured Plan] --> A4[Document in Markdown] --> A5["AI Review & Refine"] --> A6[Execute with Confidence] --> A7[Low Rework]
        
        style A1 fill:#90EE90,stroke:#333,color:#000
        style A2 fill:#90EE90,stroke:#333,color:#000
        style A3 fill:#90EE90,stroke:#333,color:#000
        style A4 fill:#90EE90,stroke:#333,color:#000
        style A5 fill:#90EE90,stroke:#333,color:#000
        style A6 fill:#90EE90,stroke:#333,color:#000
        style A7 fill:#87CEEB,stroke:#333,color:#000
    end
{{< /mermaid >}}

Before, planning existed but was time-consuming and often incomplete. I'd spend significant time researching, creating basic plans, then start coding—only to discover issues later that required rework. Now, AI-assisted planning makes the process faster, more thorough, and more effective:

1. **Use AI to explore the problem space** - Ask questions, understand constraints, identify unknowns
2. **Generate a structured plan** - Break down the work into tasks, identify dependencies, estimate complexity
3. **Document the plan** - Create markdown documents that serve as living specifications
4. **Review and refine** - Use AI to identify gaps, edge cases, and potential issues
5. **Execute with confidence** - Having a solid plan makes execution much smoother

This planning-first approach has reduced rework, caught issues earlier, and made complex projects much more manageable.

## Key Insights and Lessons

### 1. AI Doesn't Replace Thinking—It Amplifies It

The biggest misconception is that AI makes you lazy or less skilled. The opposite is true. AI handles the repetitive, time-consuming tasks, freeing you to focus on:
- Architecture and design decisions
- Complex problem-solving
- Strategic thinking
- Code review and quality assurance

### 2. Planning is Faster and More Thorough

AI doesn't eliminate planning—it makes it faster and more comprehensive. What used to take hours of manual research and deep documentation diving now happens in minutes, allowing me to:
- Understand the problem deeply without reading every parameter and syntax detail
- Design the solution architecture with AI-assisted exploration of high-level concepts
- Break down work into clear tasks with better dependency analysis
- Identify risks and edge cases that might have been missed
- Focus on the "what" and "why" instead of the "how" at the syntax level

The result is better planning in less time, which pays dividends throughout the project lifecycle. I'm spending time on architecture and trade-offs, not on memorizing API parameters.

### 3. Documentation Becomes Living and Useful

Traditional documentation often goes stale. With AI-assisted documentation:
- PRs automatically include comprehensive descriptions
- Jira tickets are well-documented and up-to-date
- Planning documents evolve with the project
- Knowledge is captured and accessible

### 4. Code Review Shifts Focus

With AI handling many of the mechanical checks, human reviewers can focus on:
- Does this solve the right problem?
- Is the architecture sound?
- Are there edge cases we're missing?
- Does this align with our long-term goals?

### 5. The Learning Curve is Real but Worth It

Adopting this workflow required:
- Learning Cursor and its features
- Building an AI library of prompts and patterns
- Developing new workflows and habits
- Experimenting to find what works best

But the investment has paid off. I'm more productive, produce higher-quality work, and have more time for the interesting, challenging problems.

## The Tools That Made It Possible

### Core Development Tools

- **Cursor**: The IDE that makes AI-first development natural
  - Ask mode for deep technical investigations
  - Plan mode for architecture and design
  - Intelligent code generation with full codebase context
  - Seamless AI workflow integration

### Model Context Protocol (MCPs)

MCPs enable AI to interact with external tools and services, automating workflows that used to be manual:

- **ClickUp MCP**: Automated task creation, updates, and documentation in ClickUp
- **GitHub MCP**: PR management, issue tracking, and repository operations
- **Jira MCP**: Ticket automation, status updates, and project management
- **Other MCPs**: Custom integrations for Slack, Confluence, monitoring tools, and more

### Command-Line Interfaces (CLIs)

CLIs become powerful when combined with AI assistance:

- **AWS CLI**: AI helps construct complex queries, understand resource relationships, and debug infrastructure issues
- **Terraform CLI**: AI-assisted state management, plan validation, and infrastructure operations
- **kubectl**: AI-guided Kubernetes operations and resource inspection
- **Other CLIs**: Cloud provider CLIs (Azure, GCP), infrastructure tools (Docker, Ansible), and custom tooling

The key is using AI to:
- Generate correct CLI commands
- Understand command outputs
- Debug errors and issues
- Learn new CLI tools faster

### Code Quality & Review Tools

- **Bugbot**: Automated bug detection and code quality analysis
- **CodeQL**: Security vulnerability scanning and static analysis
- **Cursor PR Review**: Architecture review and best practices checking
- **GitHub CLI**: Automated PR descriptions, changelogs, and documentation

### Documentation & Planning

- **Markdown**: Simple, powerful format for planning documents and living specifications
- **GitHub CLI**: Automated PR documentation and changelog generation
- **MCPs**: Automated documentation in task management systems

## What's Next?

This evolution isn't complete. I'm constantly refining my workflows, adding new prompts to my AI library, and finding new ways to leverage AI. Some areas I'm exploring:

- **Better integration** between planning documents and task management
- **Enhanced code review workflows** that combine multiple AI tools
- **Knowledge management** systems that capture and reuse learnings
- **Automated workflows** from catching an issue in monitoring to opening a PR using AI now it is possible with Sentry. Exploring other tools (though this is a subject for other post)

## Wrapping Up

The transformation from a traditional DevOps workflow to an AI-powered one has been profound. I'm spending less time on repetitive tasks and more time on the work that truly matters: architecture, planning, and strategic problem-solving.

If you're a DevOps engineer (or any engineer) considering how AI might fit into your workflow, my advice is:

1. **Start with one tool** - Don't try to change everything at once
2. **Build your AI library** - Capture prompts, patterns, and workflows that work
3. **Embrace planning** - Use AI to help you plan better, not just code faster
4. **Focus on the high-value work** - Let AI handle the repetitive stuff
5. **Keep learning** - The tools and capabilities are evolving rapidly

The future of DevOps isn't about replacing engineers with AI—it's about engineers and AI working together to build better systems, faster.

---

*Have you experienced similar workflow transformations? I'd love to hear about your journey. Find me on [LinkedIn](https://linkedin.com/in/carimfadil).*

