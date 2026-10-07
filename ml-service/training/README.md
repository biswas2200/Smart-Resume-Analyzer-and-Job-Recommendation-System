# Model Training & Fine-Tuning on Google Cloud Platform (GCP)

> **Purpose:** Setup and execution guide for training, fine-tuning, and distilling models for the Intelligent Resume Analyser using GCP cloud compute resources (e.g., Compute Engine GPU VM or Vertex AI Workbench).

---

## 1. Why Train in the Cloud?

Consumer laptops typically lack the VRAM (GPU memory) and compute capability required to fine-tune transformer models like BERT and MiniLM without thermal throttling or out-of-memory errors. 

By leveraging **Google Cloud Platform (GCP)** and the allocated **$300 GCP credit**:
* We can spin up an on-demand virtual machine with an **NVIDIA T4 GPU (16 GB VRAM)** for only **~$0.35 / hour**.
* Training jobs finish in 15–30 minutes, costing under **$0.20 per run**.
* Training dependencies (such as CUDA-enabled PyTorch, Hugging Face `accelerate`, and `evaluate`) remain isolated in the cloud without bloating the local development environment or runtime production containers.

---

## 2. GCP Infrastructure Setup

### Recommended Setup: Compute Engine VM with GPU
1. **Create an instance in GCP Console:**
   * **Machine family:** General-purpose / GPU (`n1-standard-4`, 4 vCPUs, 15 GB RAM).
   * **GPU:** 1 × NVIDIA T4 (16 GB GDDR6).
   * **Boot Disk:** Deep Learning on Linux (Debian with CUDA 12 pre-installed) — 50 GB Balanced Persistent Disk.
   * **Firewall / Access:** Allow default SSH access via `gcloud compute ssh`.

2. **Connect to the instance:**
   ```bash
   gcloud compute ssh --zone <your-zone> <instance-name>
   ```

3. **Clone the repository and install training requirements:**
   ```bash
   git clone <repo-url>
   cd Smart-Resume-Analyzer-and-Job-Recommendation-System/ml-service
   python3 -m venv .venv-train
   source .venv-train/bin/activate
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
   pip install transformers datasets sentence-transformers accelerate evaluate seqeval onnx onnxruntime
   ```

---

## 3. Training Tracks

### Track A: Resume NER Continue-Training & Distillation
* **Teacher Model:** `yashpwr/resume-ner-bert` (BERT-base, 25 BIO labels, 431 MB; pinned `3ea6ecf`).
* **Student Model:** 6-layer `distilbert-base-uncased` or `MiniLM-L6-H384`.
* **Objective:** Knowledge distillation combining:
  $$\mathcal{L} = \alpha \cdot \text{KL}(\text{student}, \text{teacher}) + (1 - \alpha) \cdot \text{CrossEntropy}(\text{labels})$$
* **Outcome:** Reduces NER model size from 431 MB to ~130 MB fp32 (~35 MB int8) and must **beat the measured baseline**: 60 % field macro F1 on the DataTurks held-out half and 64 % on the unseen LiveCareer sample (`supporting-docs/ml-pipeline.md`).

### Track B: Skill & Role Embedder Fine-Tuning
* **Base Model:** `sentence-transformers/all-MiniLM-L6-v2` (22.7M parameters).
* **Training Data:** Title-to-skill pairs and occupation-skill pairs from `app/data/role_skills.json` and LinkedIn datasets.
* **Loss Function:** `MultipleNegativesRankingLoss` (MNRL).
* **Outcome:** Enhances domain-specific semantic similarity between candidate skill variants and career role descriptions (+4.3% mAP).

---

## 4. Exporting Trained Models for Production

Once training completes and validation checks pass (held-out F1 not below previous baseline):
1. **Export to ONNX:**
   ```bash
   python -m transformers.onnx --model=./trained_ner/ --feature=token-classification ./exported_models/ner.onnx
   ```
2. **Compute Content Hash:**
   ```bash
   sha256sum ./exported_models/ner.onnx > ./exported_models/ner.onnx.sha256
   ```
3. **Deploy Artifact:**
   Copy the exported ONNX model and updated SHA hash into the production ML service configuration (`app/config.py`).
