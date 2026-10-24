# Local AI Test Ortamı

Tespit tarihi: 2026-10-19

## Donanım
- GPU: NVIDIA GeForce RTX 3090 — 24 GB VRAM
- CPU: Intel Core i5-12600K (10 çekirdek / 16 thread)
- RAM: 32 GB

## Ollama
- Sürüm: 0.40.6
- Çalıştırılabilir: `C:\Users\<kullanici>\AppData\Local\Programs\Ollama\ollama.exe`
- Model deposu: `E:\Ollama\models` (`OLLAMA_MODELS` ortam değişkeni) — salt okunur kabul edilir, burada işlem yapılmaz
- API: `http://localhost:11434`

## Kurulu modeller

| Model | Mimari | Parametre | Quant | Boyut | Bağlam | Yetenekler | VRAM'e sığar mı? |
|---|---|---|---|---|---|---|---|
| gemma4:e2b | gemma4 | 4.6B | Q4_K_M | 4.6 GB | 128K | vision, audio, tools, thinking | Evet |
| gemma4:e4b | gemma4 | 7.5B | Q4_K_M | 6.6 GB | 128K | vision, audio, tools, thinking | Evet |
| phi4-reasoning:plus | phi3 | 14.7B | Q4_K_M | 11 GB | 32K | thinking | Evet |
| richardyoung/lfm2.5-24b-a2b | lfm2moe (MoE, ~2B aktif) | 24B | Q4_K_M | 14 GB | 128K | tools, thinking | Evet |
| gemma4:26b | gemma4 (MoE) | 25.2B | Q4_K_M | 18 GB | 256K | vision, tools, thinking | Evet (bağlam sınırlı) |
| qwen2.5-coder:32b-instruct-q4_K_M | qwen2 | 32.8B | Q4_K_M | 19 GB | 32K | tools, insert (FIM) | Evet (bağlam sınırlı) |
| gemma4:31b-it-q4_K_M | gemma4 | 30.7B | Q4_K_M | 20 GB | 256K | vision, tools, thinking | Sınırda — uzun bağlamda CPU'ya taşabilir |

## Test yöntemi
- Modeller Ollama HTTP API'si (`/api/chat`) üzerinden çağrılır; çıktı, süre, token/s ve bitiş durumu kaydedilir.
- Aynı anda tek model yüklü tutulur (24 GB VRAM), testler arası `keep_alive: 0` ile boşaltılır.
- Sonuçlar bu klasörde saklanır.
