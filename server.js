
import express from "express";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { fileURLToPath } from "url";

ffmpeg.setFfmpegPath(ffmpegPath);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_CATALOG = {
  gagne: {
    label: "Robert Gagné",
    shortDescription: "Estrutura e sequência lógica da instrução.",
    criteria: [
      "Ganhar a atenção",
      "Informar os objetivos",
      "Estimular a memória de conhecimentos prévios",
      "Apresentar o conteúdo",
      "Fornecer orientação à aprendizagem",
      "Provocar o desempenho",
      "Fornecer feedback",
      "Avaliar o desempenho",
      "Favorecer retenção e transferência",
    ],
  },
  bloom: {
    label: "Taxonomia de Bloom",
    shortDescription: "Profundidade cognitiva e complexidade do pensamento.",
    criteria: [
      "Lembrar",
      "Entender",
      "Aplicar",
      "Analisar",
      "Avaliar",
      "Criar",
    ],
  },
  merrill: {
    label: "Princípios de Merrill",
    shortDescription: "Aprendizagem prática centrada em tarefa ou problema real.",
    criteria: [
      "Centralidade na tarefa",
      "Ativação",
      "Demonstração",
      "Aplicação",
      "Integração",
    ],
  },
  arcs: {
    label: "ARCS de Keller",
    shortDescription: "Motivação, atenção, relevância, confiança e satisfação.",
    criteria: [
      "Atenção",
      "Relevância",
      "Confiança",
      "Satisfação",
    ],
  },
  addie: {
    label: "ADDIE",
    shortDescription: "Planejamento e coerência macro do design instrucional.",
    criteria: [
      "Análise",
      "Design",
      "Desenvolvimento",
      "Implementação",
      "Avaliação",
    ],
  },
  assure: {
    label: "ASSURE",
    shortDescription: "Planejamento com foco em mídia, tecnologia e participação.",
    criteria: [
      "Analisar os alunos",
      "Fixar objetivos",
      "Selecionar métodos, mídias e materiais",
      "Utilizar mídias e materiais",
      "Exigir participação do aluno",
      "Avaliar e revisar",
    ],
  },
  tpack: {
    label: "TPACK",
    shortDescription: "Integração entre conteúdo, pedagogia e tecnologia.",
    criteria: [
      "Conhecimento de conteúdo",
      "Conhecimento pedagógico",
      "Conhecimento tecnológico",
      "Integração entre conteúdo e pedagogia",
      "Integração entre conteúdo e tecnologia",
      "Integração entre pedagogia e tecnologia",
      "Integração plena entre conteúdo, pedagogia e tecnologia",
    ],
  },
  reggio: {
    label: "Reggio Emilia",
    shortDescription: "Escuta, observação, documentação e autonomia criativa.",
    criteria: [
      "Escuta",
      "Observação",
      "Documentação",
      "Proposição e expressão",
    ],
  },
  kirkpatrick: {
    label: "Kirkpatrick",
    shortDescription: "Impacto da experiência: reação, aprendizagem, comportamento e resultado.",
    criteria: [
      "Reação",
      "Aprendizagem",
      "Comportamento",
      "Resultados",
    ],
  },
};

function getModelDefinition(modelKey = "gagne") {
  return MODEL_CATALOG[modelKey] || MODEL_CATALOG.gagne;
}

function buildFallbackStructure(modelKey = "gagne") {
  const definition = getModelDefinition(modelKey);
  return definition.criteria.map((criterion) => ({
    criterion,
    evidence: "",
    evaluation: "Ausente",
    observation: "",
  }));
}

function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .save(outputPath)
      .on("end", resolve)
      .on("error", reject);
  });
}

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "Orelho Multi-Model" });
});

app.post("/analyze", upload.single("audio"), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OPENAI_API_KEY não configurada.",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      error: "Áudio não recebido.",
    });
  }

  const inputPath = req.file.path;
  const wavPath = `${req.file.path}.wav`;

  try {
    await convertToWav(inputPath, wavPath);

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(wavPath),
      model: "whisper-1",
      language: "pt",
    });

    const transcript = (transcription.text || "").trim();
    const modelKey = String(req.body.analysisModel || "gagne").trim().toLowerCase();
    const modelDefinition = getModelDefinition(modelKey);
    const modelReason = String(req.body.analysisModelReason || "").trim();
    const modelSource = String(req.body.analysisModelSource || "auto").trim();

    if (!transcript) {
      return res.json({
        transcript: "",
        model: modelKey,
        model_label: modelDefinition.label,
        model_reason: modelReason || "Nenhum conteúdo textual foi captado.",
        model_source: modelSource,
        tldr: "Nenhum conteúdo textual foi captado na gravação.",
        audio_comment: "Não foi possível avaliar tecnicamente o áudio a partir da transcrição.",
        structure: buildFallbackStructure(modelKey),
        debug: "Transcrição vazia.",
      });
    }

    const details = {
      localInstitution: req.body.localInstitution || "",
      yearLevel: req.body.yearLevel || "",
      courseId: req.body.courseId || "",
      classId: req.body.classId || "",
      subject: req.body.subject || "",
      topicObjective: req.body.topicObjective || "",
      specificStudents: req.body.specificStudents || "",
      durationMinutes: req.body.durationMinutes || "",
      systemDate: req.body.systemDate || "",
    };

    const criteriaList = modelDefinition.criteria
      .map((c, idx) => `${idx + 1}. ${c}`)
      .join("\n");

    const prompt = `
Você é um especialista em análise pedagógica de gravações de aula.

Tarefa:
Analise a gravação usando EXCLUSIVAMENTE o modelo: ${modelDefinition.label}

Descrição breve do modelo:
${modelDefinition.shortDescription}

Critérios obrigatórios deste modelo:
${criteriaList}

Metadados da gravação:
- Local/Instituição: ${details.localInstitution}
- Ano/Semestre Letivo; Ciclo; Módulo: ${details.yearLevel}
- Identificação do Curso: ${details.courseId}
- Identificação da Turma: ${details.classId}
- Disciplina: ${details.subject}
- Tema/Objetivo do Encontro: ${details.topicObjective}
- Aluno(s) Específico(s): ${details.specificStudents}
- Duração prevista do encontro (minutos): ${details.durationMinutes}
- Data do sistema: ${details.systemDate}
- Motivo da sugestão do modelo: ${modelReason}
- Fonte do modelo: ${modelSource}

Regras:
- Use somente o que está presente na transcrição.
- Não invente fatos.
- Seja técnico, claro e pedagógico.
- Se a evidência for fraca, use "Parcial".
- Se não houver evidência, use "Ausente".
- Se houver evidência forte e clara, use "Adequado".
- Responda somente em JSON válido.
- O campo "audio_comment" deve ser um comentário breve e útil sobre a gravação como meio de áudio, por exemplo duração excessiva, ruídos, simultaneidade de vozes, trechos pouco claros ou, se estiver adequado, dizer que o áudio está funcional para análise. Não faça engenharia de áudio; apenas um comentário prático e prudente.

Formato obrigatório:
{
  "model": "${modelKey}",
  "model_label": "${modelDefinition.label}",
  "model_reason": "${modelReason}",
  "model_source": "${modelSource}",
  "tldr": "resumo curto em 1 frase, em português do Brasil",
  "audio_comment": "comentário técnico complementar sobre a gravação em áudio",
  "structure": [
    {
      "criterion": "nome do critério 1",
      "evidence": "",
      "evaluation": "Adequado | Parcial | Ausente",
      "observation": ""
    }
  ]
}

Transcrição:
${transcript}
`;

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const text = (resp.output_text || "").trim();

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        model: modelKey,
        model_label: modelDefinition.label,
        model_reason: modelReason || "",
        model_source: modelSource,
        tldr: transcript.slice(0, 220) || "Sem resumo disponível.",
        audio_comment: "Áudio funcional para análise, mas a resposta estruturada precisou usar fallback.",
        structure: buildFallbackStructure(modelKey),
      };
    }

    const normalizedStructure = Array.isArray(parsed.structure)
      ? parsed.structure.map((row, idx) => ({
          criterion: row.criterion || modelDefinition.criteria[idx] || `Critério ${idx + 1}`,
          evidence: row.evidence || "",
          evaluation: row.evaluation || "Ausente",
          observation: row.observation || "",
        }))
      : buildFallbackStructure(modelKey);

    res.json({
      transcript,
      model: parsed.model || modelKey,
      model_label: parsed.model_label || modelDefinition.label,
      model_reason: parsed.model_reason || modelReason || "",
      model_source: parsed.model_source || modelSource,
      tldr: parsed.tldr || "Sem resumo disponível.",
      audio_comment: parsed.audio_comment || "Sem comentário técnico complementar.",
      structure: normalizedStructure,
      debug: "OK",
    });
  } catch (err) {
    res.status(500).json({
      error: "Falha ao analisar o áudio.",
      detail: String(err?.message || err),
    });
  } finally {
    fs.unlink(inputPath, () => {});
    fs.unlink(wavPath, () => {});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Orelho Multi-Model on port ${port}`);
});
