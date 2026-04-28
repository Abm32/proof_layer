# ProofLayer: AI Ethics & Compliance Protocol

ProofLayer is a mathematical verification layer for Enterprise AI. It provides an independent auditing trail for machine learning models, ensuring fairness and transparency without requiring access to proprietary model code.

## 🚀 The ProofLayer Protocol

To maintain a valid compliance chain, follow these three steps:

### 1. Subject Model Execution
Run your enterprise machine learning model (the "Subject Model") on your local infrastructure using your validation datasets. Export your model's **Predictions** as a CSV file.
*   *Note: ProofLayer does not host your model logic; it audits your model's behavior via its outputs.*

### 2. Independent Verification (The Auditor)
Upload your CSV predictions to the **Analyze** tab.
*   Select the **Sensitive Attribute** (e.g., Gender, Race) and the **Target Outcome**.
*   Select an **Auditor Intelligence** (AI Model like Gemini 1.5 Pro).
*   The Auditor calculates Disparate Impact, selection rates, and provides a narrative ethical interpretation.

### 3. Compliance Registry Linkage
When performing an audit, link the result to a specific entry in your **Model Registry**.
*   This creates a permanent association between a model version and its mathematical fairness scores.
*   **Version Tracking**: Allows you to see how fairness scores evolve as you deploy new versions (v1.0.0 -> v1.1.0).
*   **Audit Trail**: Captures `createdAt`, `updatedAt`, and `deploymentDate` timestamps for every registry entry and linked audit.

## 📊 Core Concepts

### Model Registry vs. Live Model
The **Model Inventory** is a management system for your "AI Assets". You are not uploading the model itself, but its "Identity". By tracking names, versions, and accuracy alongside audit results, you prove to regulators and stakeholders that your model has been verified at every stage.

### Why Gemini for Auditing?
We use Gemini as a "Neutral Third Party". While your model makes the predictions, Gemini analyzes those predictions mathematically to detect bias patterns that human reviewers or simple scripts might miss.

### State & Integrity
*   **Deployment Date**: Track when each model version went live.
*   **Verification History**: Every CSV analysis linked to a model registry entry becomes part of its "Compliance Certificate".
*   **Server Timestamps**: All audits are timestamped via Firestore Server Timestamps to ensure the integrity of the audit timeline.

---
*Built for Ethical AI Governance.*
