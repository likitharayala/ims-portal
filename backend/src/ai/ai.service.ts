import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';

interface McqQuestion {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  marks: number;
}

interface DescriptiveQuestion {
  questionText: string;
  marks: number;
}

export type GeneratedQuestion = McqQuestion | DescriptiveQuestion;

@Injectable()
export class AiService {
  private readonly openai: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('GROQ_API_KEY');
    if (key) {
      this.openai = new OpenAI({
        apiKey: key,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
  }

  async generateQuestions(dto: GenerateQuestionsDto): Promise<GeneratedQuestion[]> {
    if (!this.openai) {
      throw new BadRequestException(
        'AI generation is not configured. Please set GROQ_API_KEY.',
      );
    }

    const marksPerQuestion = dto.marksPerQuestion ?? (dto.questionType === 'mcq' ? 1 : 5);
    const subjectContext = dto.subject ? ` for ${dto.subject}` : '';

    const prompt =
      dto.questionType === 'mcq'
        ? `Generate exactly ${dto.count} multiple choice questions about "${dto.topic}"${subjectContext}.
Return ONLY a valid JSON array with this exact structure, no other text:
[
  {
    "questionText": "...",
    "optionA": "...",
    "optionB": "...",
    "optionC": "...",
    "optionD": "...",
    "correctOption": "A",
    "marks": ${marksPerQuestion}
  }
]
Rules: correctOption must be exactly "A", "B", "C", or "D". All 4 options must be distinct. Questions must be clear and unambiguous.`
        : `Generate exactly ${dto.count} descriptive questions about "${dto.topic}"${subjectContext}.
Return ONLY a valid JSON array with this exact structure, no other text:
[
  {
    "questionText": "...",
    "marks": ${marksPerQuestion}
  }
]
Rules: Questions should require detailed written answers. Vary complexity across the set.`;

    let content: string;
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert educator. Generate exam questions exactly as requested. Return only valid JSON arrays, no markdown, no extra text.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      content = completion.choices[0]?.message?.content ?? '';
    } catch {
      throw new InternalServerErrorException(
        'AI generation failed. Please try again or add questions manually.',
      );
    }

    // Strip markdown code blocks if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new InternalServerErrorException(
        'AI returned an invalid response. Please try again or add questions manually.',
      );
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new InternalServerErrorException(
        'AI returned no questions. Please try again or add questions manually.',
      );
    }

    // Validate structure
    const questions = parsed as Record<string, unknown>[];
    if (dto.questionType === 'mcq') {
      const validOptions = ['A', 'B', 'C', 'D'];
      for (const q of questions) {
        if (
          typeof q.questionText !== 'string' ||
          typeof q.optionA !== 'string' ||
          typeof q.optionB !== 'string' ||
          typeof q.optionC !== 'string' ||
          typeof q.optionD !== 'string' ||
          !validOptions.includes(q.correctOption as string)
        ) {
          throw new InternalServerErrorException(
            'AI returned malformed questions. Please try again.',
          );
        }
        q.marks = Number(q.marks) || marksPerQuestion;
      }
    } else {
      for (const q of questions) {
        if (typeof q.questionText !== 'string') {
          throw new InternalServerErrorException(
            'AI returned malformed questions. Please try again.',
          );
        }
        q.marks = Number(q.marks) || marksPerQuestion;
      }
    }

    return questions as unknown as GeneratedQuestion[];
  }
}
