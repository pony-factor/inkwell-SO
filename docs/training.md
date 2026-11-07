# Prepare a personal spellchecking model

The initial **Inkwell 0.1.0** model (`inkwell:0.1.0`) is a prompt-configured
Qwen3 model produced by `ollama create inkwell:0.1.0 -f models/Modelfile`.
It has not been fine-tuned. It uses the existing model and the strict prompt.
Fine-tuning is **optional and not yet performed**. Train only on corrections
you have explicitly reviewed and approved: an automatic model's guessed output
is not reliable ground truth.

## 1. Prepare reviewable input/output pairs

Use one JSON object per line in `train/pairs.jsonl`:

```json
{"input":"Pleese reveiw this.","output":"Please review this."}
```

Include examples where the correct output is **identical** to the input.
Include domain-specific terminology, markdown, code, addresses/URLs, and
unusually typo-heavy passages. Keep personally sensitive writing on your own
computer. The private pairs and generated data directory are gitignored.

For a quick dataset-converter smoke test only, use the *synthetic illustrative*
pairs in `train/examples.sample.jsonl`. They are not a meaningful training set.

```sh
node train/prepare.mjs train/examples.sample.jsonl train/data
```

The deterministic split produces `train.jsonl`, `valid.jsonl`, and
`test.jsonl`, each using MLX's chat messages format. Duplicate source
examples, invalid rows, and altered newline counts fail validation. For
actual training replace the sample with hundreds of approved examples.

## 2. Fine-tune using MLX on Apple Silicon

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install "mlx-lm[train]"
mlx_lm.lora \
  --model mlx-community/Qwen3-4B-4bit \
  --train --mask-prompt \
  --data train/data \
  --adapter-path train/adapters \
  --batch-size 1 --iters 400
```

The iteration count is a starting experiment, not a validated quality target.
Check the current [MLX-LM LoRA instructions](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)
for compatibility and any changed command flags. This script does not train a
model automatically, install Python packages, or upload a dataset.

## 3. Evaluate before replacing the original model

Run an MLX loss test with held-out examples:

```sh
mlx_lm.lora --model mlx-community/Qwen3-4B-4bit \
  --adapter-path train/adapters --data train/data --test
```

After a separately verified export/import to Ollama, compare the first
**Inkwell 0.1.0** model against a newer tuned model, each with its own tag:

```sh
OLLAMA_MODEL=inkwell:0.1.0 node train/evaluate.mjs train/data/test.jsonl
OLLAMA_MODEL=inkwell:0.2.0 node train/evaluate.mjs train/data/test.jsonl
```

The evaluation reports exact-match accuracy, rejected responses, and
unwanted changes to already-correct text. It does not print source text.

**Export caution:** MLX LoRA adapter files are not Ollama models.
Merging an adapter and converting Qwen MLX weights into a supported GGUF
requires an export workflow validated against the versions installed locally;
do not assume the MLX GGUF exporter supports Qwen. Once you have verified a
GGUF, import it with an Ollama Modelfile using `FROM ./model.gguf`,
then create a **new versioned tag** (for example `inkwell:0.2.0`),
and set the extension's `inkwell.ollama.model` to that tag. Do not
claim a new model version has been trained until its weights and
held-out results have been independently verified.
