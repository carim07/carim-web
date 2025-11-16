---
title: "How AI Transformed My Workflow as a Senior DevOps Engineer"
date: 2025-11-18T10:00:00-07:00
lastmod: 2025-11-18T10:00:00-07:00
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

My workflow used to follow a pretty standard pattern:

{{< mermaid >}}
flowchart TD
    Start([Start Task]) --> Investigate["🔍 Investigation"]
    Investigate --> Google[Google Search]
    Investigate --> StackOverflow[Stack Overflow]
    Investigate --> Docs[AWS Docs]
    Investigate --> Trial["Trial & Error"]
    
    Google --> Code["💻 Development"]
    StackOverflow --> Code
    Docs --> Code
    Trial --> Code
    
    Code --> VSCode[VS Code Editor]
    VSCode --> Manual[Manual Coding]
    Manual --> Copilot["GitHub Copilot - Basic Autocomplete"]
    Copilot --> Review["📝 Code Review"]
    
    Code --> Tasks["📋 Task Management"]
    Tasks --> ManualJira[Manual Jira Tickets]
    Tasks --> ManualDocs[Manual PR Docs]
    
    Review --> HumanReview[Human Reviewers]
    Review --> BasicChecks[Basic Linting]
    
    HumanReview --> Done([Done])
    BasicChecks --> Done
    
    style Investigate fill:#FFE4B5
    style Code fill:#FFB6C1
    style Tasks fill:#E0E0E0
    style Review fill:#DDA0DD
    style Manual fill:#FF6B6B
    style Done fill:#90EE90
{{< /mermaid >}}

### Investigation
- **Google searches** for documentation, error messages, and solutions
- **Stack Overflow** deep dives
- **AWS documentation** browsing
- Manual trial and error

### Development
- **VS Code** as my primary editor
- **AI-assisted autocomplete** (GitHub Copilot) for basic suggestions
- **Mostly manual coding** with occasional AI help
- Writing code line by line, function by function

### Task Management
- **Manual Jira ticket creation** and updates
- **Manual documentation** in PRs and tickets
- Keeping track of tasks in my head or scattered notes

### Code Review
- **Manual PR reviews** with human reviewers
- Basic automated checks (linting, basic security scans)

This workflow worked, but it was time-consuming. I spent a lot of time on repetitive tasks, searching for information, and writing boilerplate code. The cognitive load was high, and I often found myself context-switching between investigation, coding, and documentation.

## The Now: AI-Powered DevOps Workflow

Fast forward to today, and my workflow looks completely different:

{{< mermaid >}}
flowchart TD
    Start([Start Task]) --> Plan["📐 AI-Assisted Planning"]
    Plan --> Markdown[Markdown Planning Docs]
    Plan --> AIExplore[AI Problem Exploration]
    Plan --> StructuredPlan[Structured Task Breakdown]
    
    Plan --> Investigate["🔍 AI-Assisted Investigation"]
    Investigate --> CursorAsk[Cursor Ask Mode]
    Investigate --> AWSCLI["AI + AWS CLI"]
    Investigate --> OtherCLIs["AI + Other CLIs"]
    
    Investigate --> Develop["💻 AI-Powered Development"]
    Develop --> Cursor[Cursor IDE]
    Cursor --> AILibrary["AI Library - Prompts & Patterns"]
    Cursor --> PlanMode[Plan Mode]
    Cursor --> CodeGen[Intelligent Code Gen]
    
    Develop --> Tasks["📋 Automated Task Management"]
    Tasks --> MCPs["MCPs: Jira, GitHub, etc."]
    Tasks --> GHCLI["GitHub CLI + AI"]
    Tasks --> AutoDocs[Auto Documentation]
    
    Develop --> Review["📝 Multi-Layer Review"]
    Review --> Bugbot[Bugbot]
    Review --> CodeQL[CodeQL Scanning]
    Review --> CursorReview[Cursor PR Review]
    Review --> HumanReview["Human Review - High-Level Focus"]
    
    Review --> Done([Done])
    HumanReview --> Done
    
    style Plan fill:#90EE90
    style Investigate fill:#87CEEB
    style Develop fill:#DDA0DD
    style Tasks fill:#FFD700
    style Review fill:#FFA07A
    style Done fill:#90EE90
    style CursorAsk fill:#FFE4B5
    style AWSCLI fill:#FFE4B5
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

### The Most Important Change: AI-Assisted Planning

If I had to pick one change that's had the biggest impact, it's **AI-assisted planning**. 

{{< mermaid >}}
flowchart TB
    subgraph Before["Before: Manual Planning"]
        direction LR
        B1[Problem] --> B2[Manual Research] --> B3[Quick Planning] --> B4[Start Coding] --> B5[Discover Issues] --> B6[Fix & Rework]
        
        style B1 fill:#FFB6C1
        style B2 fill:#FFB6C1
        style B3 fill:#FFB6C1
        style B4 fill:#FFB6C1
        style B5 fill:#FFB6C1
        style B6 fill:#FF6B6B
    end
    
    Before ==>|"AI-Assisted Evolution"| After
    
    subgraph After["Now: AI-Assisted Planning"]
        direction LR
        A1[Problem] --> A2[AI Explore Problem Space] --> A3[Generate Structured Plan] --> A4[Document in Markdown] --> A5["AI Review & Refine"] --> A6[Execute with Confidence] --> A7[Low Rework]
        
        style A1 fill:#90EE90
        style A2 fill:#90EE90
        style A3 fill:#90EE90
        style A4 fill:#90EE90
        style A5 fill:#90EE90
        style A6 fill:#90EE90
        style A7 fill:#87CEEB
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

AI doesn't eliminate planning—it makes it faster and more comprehensive. What used to take hours of manual research and documentation now happens in minutes, allowing me to:
- Understand the problem deeply without spending hours researching
- Design the solution architecture with AI-assisted exploration
- Break down work into clear tasks with better dependency analysis
- Identify risks and edge cases that might have been missed

The result is better planning in less time, which pays dividends throughout the project lifecycle.

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

- **More sophisticated planning workflows** for complex multi-team projects
- **Better integration** between planning documents and task management
- **Enhanced code review workflows** that combine multiple AI tools
- **Knowledge management** systems that capture and reuse learnings

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

