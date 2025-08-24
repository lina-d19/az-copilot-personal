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
