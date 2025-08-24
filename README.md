# Azure Observability Copilot

## Overview  
**Azure Observability Copilot** is a GitHub Copilot Chat extension that empowers developers with real-time insights into their Azure application telemetry—errors, latency, and service health—without leaving their IDE. It turns natural language prompts like:  

> “Why is latency high today?”  
> “Show me recent errors in our Function App.”  

into actionable queries, code suggestions, and troubleshooting steps.  

This project demonstrates end-to-end integration across **GitHub Copilot**, **Azure Functions**, **GitHub Actions (CI/CD)**, and **mock Azure telemetry**, showcasing full-stack cloud development, automation, and observability skills.

---

## Why This Project Stands Out

- **Accelerates debugging:** Converts natural language questions into telemetry insights and suggested fixes.  
- **Full DevOps lifecycle:** Code → Test → Deploy → Monitor via GitHub Actions, Azure Functions, and mock Application Insights.  
- **Multi-tech expertise:** Combines TypeScript (extension), Python (backend), and PowerShell (local testing).  
- **AI-enabled workflows:** Integrates OpenAI-powered prompt handling for query generation and remediation advice.  
- **Stakeholder-ready:** Successfully demoed to internal audiences, showcasing communication and delivery skills.  

---

## Features

- **Conversational Telemetry Queries** – Query errors, latency, or service health in plain English.  
- **KQL & JSON Query Generation** – Automatically builds Azure Application Insights/Log Analytics queries.  
- **Azure Function Backend** – Processes requests, executes queries, and returns results.  
- **CI/CD Automation** – GitHub Actions workflows for build, test, and deployment.  
- **Local Testing Tools** – PowerShell scripts and a sample latency app to test scenarios offline.  
- **AI Recommendations** – Uses OpenAI to suggest code fixes or next troubleshooting steps (prototype).  

---

## Architecture

```text
[GitHub Copilot Chat]
        ↓
[Extension (TypeScript) → Azure Function (Python)]
        ↓
[Telemetry Query Generation (JSON/KQL)]
        ↓
[Mock Telemetry / Sample Latency App]
        ↓
[Results + AI-Generated Suggestions Back to Developer]
```
---

## Getting Started
**Prerequisites**
- Visual Studio Code with GitHub Copilot Chat
- Azure Functions Core Tools
- Node.js & npm
- PowerShell (for local testing)

---

## Setup

```
# Clone the repository
git clone https://github.com/lina-d19/az-copilot-personal.git
cd az-copilot-personal

# Install dependencies (for the extension, if applicable)
npm install

# Start Azure Functions locally
func start
```
---
## Running Tests

```
# Run unit tests
npm test

# Run integration tests
npm run test:integration
```


## How It Works

1. Developer asks a question in Copilot Chat.  
   *Example:* “Show me the last 10 errors in our main API.”
2. Extension interprets the question and builds a query (**JSON/KQL**).
3. Azure Function executes the query against mock telemetry or sample latency data.
4. Results are returned with optional AI suggestions for fixing the issue.

## CI/CD Flow

1. Push to `main` triggers **GitHub Actions**:
   - Lint & test **TypeScript/Python** code
   - Deploy **Azure Functions**
   - Run smoke checks post-deploy

This ensures **continuous delivery** and **production-ready reliability**.

## Learnings

| Skill Area         | Demonstrated Through This Project                 |
|--------------------|---------------------------------------------------|
| Full-Stack Cloud   | GitHub Copilot extension + Azure Functions        |
| DevOps Mastery     | GitHub Actions CI/CD pipelines                    |
| AI Integration     | Prompt-to-query translation & recommendations     |
| Data Handling      | JSON/KQL telemetry parsing                        |
| Presentation       | Internal demos with live feedback                 |


