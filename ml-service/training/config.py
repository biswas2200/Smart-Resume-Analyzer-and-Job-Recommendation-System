"""Configuration and hyperparameters for model training & fine-tuning on GCP.
"""

from pathlib import Path
from pydantic import BaseModel

TRAINING_DIR = Path(__file__).resolve().parent
ML_SERVICE_DIR = TRAINING_DIR.parent
DATA_DIR = ML_SERVICE_DIR / "app" / "data"
OUTPUT_DIR = TRAINING_DIR / "output"


class NERTrainingConfig(BaseModel):
    """Hyperparameters for resume NER continue-training & distillation."""
    base_model: str = "yashpwr/resume-ner-bert"
    student_model: str = "distilbert-base-uncased"
    batch_size: int = 16
    learning_rate: float = 3e-5
    num_epochs: int = 5
    max_seq_length: int = 512
    temperature: float = 2.0
    alpha_ce: float = 0.5
    alpha_kd: float = 0.5
    output_dir: Path = OUTPUT_DIR / "ner"


class EmbedderTrainingConfig(BaseModel):
    """Hyperparameters for SentenceTransformer fine-tuning on skill-role pairs."""
    base_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    batch_size: int = 32
    learning_rate: float = 2e-5
    num_epochs: int = 3
    output_dir: Path = OUTPUT_DIR / "embedder"


ner_config = NERTrainingConfig()
embedder_config = EmbedderTrainingConfig()
