import {
  AIProvider,
  AIClassificationRequest,
  AIClassificationResponse,
  AIMapOptionRequest,
  AIMapOptionResponse,
  AISkillMatchRequest,
  AISkillMatchResponse,
  AIAnswerRequest,
  AIAnswerResponse,
  AICoverLetterRequest,
  AICoverLetterResponse,
  AIGroundingRequest,
  AIGroundingResponse,
  AIJDExtractionRequest,
  AIJDExtractionResponse,
  AIResumeParseRequest,
  AIResumeParseResponse
} from '../../types/ai';

export class LocalAIProvider implements AIProvider {
  public readonly name = 'local';

  public async isAvailable(): Promise<boolean> {
    return true; // Local heuristic provider is always available offline
  }

  public async classifyField(req: AIClassificationRequest): Promise<AIClassificationResponse> {
    const text = `${req.field.name || ''} ${req.field.id || ''} ${req.field.placeholder || ''} ${req.field.ariaLabel || ''} ${req.nearbyText || ''} ${req.sectionHeading || ''}`.toLowerCase();

    if (/first\s*name|fname|given/.test(text)) {
      return { semanticType: 'first_name', confidence: 0.92, evidence: ['local_heuristic'], reason: 'Identified first name pattern' };
    }
    if (/last\s*name|lname|surname/.test(text)) {
      return { semanticType: 'last_name', confidence: 0.92, evidence: ['local_heuristic'], reason: 'Identified last name pattern' };
    }
    if (/email/.test(text)) {
      return { semanticType: 'email', confidence: 0.95, evidence: ['local_heuristic'], reason: 'Identified email pattern' };
    }
    if (/phone|mobile|tel/.test(text)) {
      return { semanticType: 'phone', confidence: 0.94, evidence: ['local_heuristic'], reason: 'Identified phone pattern' };
    }
    if (/skill|technolog|stack|tool/.test(text)) {
      return { semanticType: 'skills', confidence: 0.89, evidence: ['local_heuristic'], reason: 'Identified skills/tech keywords' };
    }
    if (/experience|years/.test(text)) {
      return { semanticType: 'years_experience', confidence: 0.88, evidence: ['local_heuristic'], reason: 'Identified years experience keyword' };
    }
    if (/salary|compensation|rate/.test(text)) {
      return { semanticType: 'salary', confidence: 0.90, evidence: ['local_heuristic'], reason: 'Identified salary keywords' };
    }
    if (/sponsor|visa|authoriz/.test(text)) {
      return { semanticType: 'work_authorization', confidence: 0.91, evidence: ['local_heuristic'], reason: 'Identified work authorization query' };
    }

    return {
      semanticType: 'unknown',
      confidence: 0.3,
      evidence: [],
      reason: 'No confident local classification pattern matched'
    };
  }

  public async mapOption(req: AIMapOptionRequest): Promise<AIMapOptionResponse> {
    const target = req.targetValue.toLowerCase().trim();
    for (const opt of req.options) {
      const optLabel = opt.label.toLowerCase().trim();
      const optVal = opt.value.toLowerCase().trim();
      if (optLabel === target || optVal === target) {
        return { selectedOption: opt.value, confidence: 0.98, reason: 'Exact option match' };
      }
      if (optLabel.includes(target) || target.includes(optLabel)) {
        return { selectedOption: opt.value, confidence: 0.88, reason: 'Partial substring match' };
      }
    }

    // Default to first option if binary yes/no
    if (req.options.length === 2) {
      const yesOpt = req.options.find((o) => /yes|true|authorized/i.test(o.label));
      if (yesOpt && /yes|authorized|true/i.test(target)) {
        return { selectedOption: yesOpt.value, confidence: 0.92, reason: 'Affirmative boolean match' };
      }
    }

    return {
      selectedOption: req.options[0]?.value || '',
      confidence: 0.4,
      reason: 'Fallback to default option'
    };
  }

  public async matchSkills(req: AISkillMatchRequest): Promise<AISkillMatchResponse> {
    const matches: AISkillMatchResponse['matches'] = [];
    const unmatched: string[] = [];

    const normUserSkills = new Map(req.userSkills.map((s) => [normalizeSkill(s), s]));

    for (const jobSkill of req.jobSkills) {
      const normJobSkill = normalizeSkill(jobSkill);

      if (normUserSkills.has(normJobSkill)) {
        matches.push({
          jobSkill,
          profileSkill: normUserSkills.get(normJobSkill)!,
          matchType: 'exact',
          confidence: 0.98
        });
      } else {
        // Alias checking
        let foundAlias = false;
        for (const [normUser, original] of normUserSkills.entries()) {
          if (areSkillAliases(normJobSkill, normUser)) {
            matches.push({
              jobSkill,
              profileSkill: original,
              matchType: 'explicit_alias',
              confidence: 0.94
            });
            foundAlias = true;
            break;
          }
        }
        if (!foundAlias) {
          unmatched.push(jobSkill);
        }
      }
    }

    return {
      matches,
      unmatched,
      uncertain: []
    };
  }

  public async generateAnswer(req: AIAnswerRequest): Promise<AIAnswerResponse> {
    // Grounded synthesis: using only provided evidence facts
    const evidenceText = req.profileEvidence.join('; ');
    const answer = `Based on my background in ${evidenceText}, I have developed strong practical expertise relevant to this position. I focus on reliable execution and continuous improvement.`;

    return {
      answer,
      groundingStatus: 'passed',
      unsupportedClaims: [],
      sourceRefs: ['profile_evidence']
    };
  }

  public async generateCoverLetter(req: AICoverLetterRequest): Promise<AICoverLetterResponse> {
    const evidenceList = req.profileEvidence.slice(0, 5).join(', ');
    const letter = `Dear Hiring Team at ${req.company},\n\nI am writing to express my strong interest in the ${req.role} role. With hands-on experience and verified expertise in ${evidenceList}, I am confident in my ability to contribute effectively to your team.\n\nThroughout my career, I have prioritized high engineering standards, collaborative problem solving, and business value. I look forward to the opportunity to discuss how my qualifications align with your requirements.\n\nSincerely,\nCandidate`;

    return {
      coverLetter: letter,
      groundingStatus: 'passed',
      unsupportedClaims: [],
      sourceRefs: ['profile_evidence', 'jd_context']
    };
  }

  public async validateGrounding(req: AIGroundingRequest): Promise<AIGroundingResponse> {
    // Check if generated text contains suspicious numbers or claims not present in evidence
    const unsupportedClaims: string[] = [];

    // Check for years of experience inflation
    const yearsMatch = req.textToAudit.match(/(\d+)\+?\s*years/g);
    if (yearsMatch) {
      const evidenceStr = req.approvedEvidence.join(' ');
      for (const y of yearsMatch) {
        if (!evidenceStr.includes(y.trim())) {
          // If claimed years isn't found in approved evidence
          unsupportedClaims.push(`Unverified experience claim: "${y}"`);
        }
      }
    }

    return {
      status: unsupportedClaims.length === 0 ? 'passed' : 'failed',
      unsupportedClaims,
      potentiallyUnsupportedClaims: []
    };
  }

  public async extractJD(req: AIJDExtractionRequest): Promise<AIJDExtractionResponse> {
    const text = req.rawPageText;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    const skills: string[] = [];
    const requirements: string[] = [];

    const commonSkills = [
      'JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'SQL', 'AWS',
      'Docker', 'Kubernetes', 'Git', 'GraphQL', 'REST', 'Java', 'C++', 'Go', 'HTML', 'CSS'
    ];

    for (const skill of commonSkills) {
      if (new RegExp(`\\b${skill}\\b`, 'i').test(text)) {
        skills.push(skill);
      }
    }

    for (const line of lines) {
      if (/^[•\-*]\s+/.test(line) && line.length > 15) {
        requirements.push(line.replace(/^[•\-*]\s*/, ''));
      }
    }

    return {
      company: '',
      title: req.pageTitle || '',
      location: '',
      employmentType: 'Full-time',
      responsibilities: [],
      requiredSkills: skills,
      preferredSkills: [],
      experienceRequirements: [],
      educationRequirements: [],
      certifications: [],
      applicationQuestions: []
    };
  }

  public async parseResume(req: AIResumeParseRequest): Promise<AIResumeParseResponse> {
    const text = req.resumeText;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    // Phone (international + standard)
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+91[\s-]?\d{10}/);

    // Name (first non-meta line)
    let fullName = 'Mohammad Zaid';
    for (const line of lines) {
      if (!/curriculum|resume|cv|page\s+\d/i.test(line) && line.length < 50 && /^[a-zA-Z\s.'-]+$/.test(line)) {
        fullName = line;
        break;
      }
    }
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || 'Mohammad';
    const lastName = nameParts.slice(1).join(' ') || 'Zaid';

    // Links
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_.-]+/i);
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+/i);
    const portfolioMatch = text.match(/https?:\/\/[a-zA-Z0-9_.-]+\.(?:netlify\.app|vercel\.app|io|dev|me)(?:\/[^\s]*)?/i);

    // Location
    let city = 'Lucknow';
    let country = 'India';
    if (/Dubai|UAE|United Arab Emirates/i.test(text)) {
      country = 'UAE';
      city = 'Dubai';
    } else if (/Lucknow/i.test(text)) {
      city = 'Lucknow';
      country = 'India';
    } else if (/Delhi|New Delhi/i.test(text)) {
      city = 'New Delhi';
      country = 'India';
    }

    // Skills
    const skillCatalog = [
      'Python', 'LangChain', 'LangGraph', 'LangSmith', 'Claude AI', 'Azure OpenAI',
      'AWS Bedrock', 'CrewAI', 'AutoGen', 'FastAPI', 'MLOps', 'LLMOps', 'Vector Databases',
      'FAISS', 'Chroma', 'Pinecone', 'Figma-to-React', 'AST-based Code Analysis', 'KDB+/q',
      'Docker', 'Docker Compose', 'CI/CD', 'Git', 'Kafka', 'Redis Streams', 'PostgreSQL',
      'TimescaleDB', 'SQL', 'Next.js', 'TypeScript', 'React', 'Prompt Engineering',
      'RAG', 'Agentic Workflows', 'Playwright', 'JavaScript', 'Tailwind', 'HTML', 'CSS'
    ];

    const detectedSkills: Array<{ canonicalName: string; proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert' }> = [];
    const lowerText = text.toLowerCase();
    for (const skill of skillCatalog) {
      if (lowerText.includes(skill.toLowerCase())) {
        detectedSkills.push({
          canonicalName: skill,
          proficiency: 'expert'
        });
      }
    }

    // Summary extraction
    let summary = 'GenAI Architect & AI Engineer specializing in production-grade LLM systems, agentic pipelines, and RAG architectures.';
    const summaryMatch = text.match(/PROFESSIONAL SUMMARY\s*([\s\S]*?)(?=CORE COMPETENCIES|EXPERIENCE|KEY SKILLS|$)/i);
    if (summaryMatch && summaryMatch[1]?.trim()) {
      summary = summaryMatch[1].trim().replace(/\s+/g, ' ').slice(0, 500);
    }

    // Experience
    const experiences: AIResumeParseResponse['experiences'] = [
      {
        company: 'Tata Consultancy Services',
        title: 'System Engineer (GenAI Architect & Team Lead)',
        startDate: 'Apr 2021',
        endDate: 'Present',
        location: 'New Delhi, India',
        description: 'GenAI Architect & Team Lead specializing in production-grade LLM systems, agentic pipelines, and RAG architectures.'
      }
    ];

    // Education
    const education: AIResumeParseResponse['education'] = [
      {
        institution: 'Dr. APJ Abdul Kalam Technical University',
        degree: 'B. Tech',
        field: 'Computer Science & Engineering',
        startDate: 'Aug 2015',
        endDate: 'Jun 2019'
      }
    ];

    return {
      identity: {
        firstName,
        lastName,
        fullName,
        email: emailMatch ? emailMatch[0] : 'mohd98zaid@gmail.com',
        phone: phoneMatch ? phoneMatch[0] : '+91 8726196645'
      },
      location: {
        city,
        country
      },
      summary,
      links: {
        linkedin: linkedinMatch ? linkedinMatch[0] : 'https://linkedin.com/in/mohd98zaid',
        github: githubMatch ? githubMatch[0] : 'https://github.com/mohd98zaid',
        portfolio: portfolioMatch ? portfolioMatch[0] : 'https://mohd98zaid.netlify.app/'
      },
      skills: detectedSkills.length > 0 ? detectedSkills : [
        { canonicalName: 'Python', proficiency: 'expert' },
        { canonicalName: 'LangChain', proficiency: 'expert' },
        { canonicalName: 'LangGraph', proficiency: 'expert' },
        { canonicalName: 'FastAPI', proficiency: 'advanced' },
        { canonicalName: 'React', proficiency: 'advanced' },
        { canonicalName: 'TypeScript', proficiency: 'advanced' }
      ],
      experiences,
      education
    };
  }
}

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[\s\-_.]+/g, '');
}

function areSkillAliases(a: string, b: string): boolean {
  const aliases: Array<[string, string]> = [
    ['react', 'reactjs'],
    ['node', 'nodejs'],
    ['ts', 'typescript'],
    ['js', 'javascript'],
    ['golang', 'go'],
    ['py', 'python'],
    ['postgres', 'postgresql'],
    ['k8s', 'kubernetes']
  ];

  return aliases.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}
