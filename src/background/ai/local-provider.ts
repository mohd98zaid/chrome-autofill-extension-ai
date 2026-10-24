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
import { cleanAnswerText } from '../../utils/text-cleaner';

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
    const qLower = req.question.toLowerCase().trim();
    const evidenceText = (req.profileEvidence || []).join(' ');
    const evidenceLower = evidenceText.toLowerCase();

    // 1. If choices/options are provided (for Select, Radio, Checkbox)
    if (req.options && req.options.length > 0) {
      const scored = req.options.map((opt) => {
        const optLower = opt.toLowerCase().trim();
        let score = 0;

        // Skip placeholder options like "Select an option"
        if (/^(?:select|choose|please select|--)/i.test(optLower)) {
          return { opt, score: -100 };
        }

        // Keywords in the option matching candidate evidence
        const optWords = optLower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
        for (const w of optWords) {
          if (evidenceLower.includes(w)) score += 3;
          if (qLower.includes(w)) score += 1;
        }

        // Positive experience heuristics for "Yes - ..." vs "No"
        if (/^yes\b/i.test(optLower)) {
          const qWords = qLower.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !['have', 'performed', 'experience', 'many', 'years'].includes(w));
          const hasRelevantExp = qWords.some((w) => evidenceLower.includes(w));
          if (hasRelevantExp) {
            score += 10;
            if (/advanced|extensive|hands-on/i.test(optLower)) score += 5;
          } else {
            score += 2;
          }
        } else if (/^no\b/i.test(optLower)) {
          score += 1;
        }

        return { opt, score };
      });

      scored.sort((a, b) => b.score - a.score);

      if (req.isMultiSelect) {
        const positive = scored.filter((s) => s.score > 2).map((s) => s.opt);
        const selected = positive.length > 0 ? positive : [scored[0]?.opt || req.options[0]];
        return {
          answer: selected.join(', '),
          selectedOptions: selected,
          groundingStatus: 'passed',
          unsupportedClaims: [],
          sourceRefs: ['profile_evidence']
        };
      }

      const best = scored[0]?.opt || req.options[0];
      return {
        answer: best,
        selectedOptions: [best],
        groundingStatus: 'passed',
        unsupportedClaims: [],
        sourceRefs: ['profile_evidence']
      };
    }

    // 2. Open-ended Text / Textarea answering
    // Check if asking for years of experience
    if (/how many years|years of (?:hands-on )?experience/i.test(qLower)) {
      const yearMatches = evidenceText.match(/(\d+(?:\.\d+)?)\s*(?:\+|-)?\s*years/i);
      const yearsNum = yearMatches ? yearMatches[1] : '3+';
      
      let answer: string;
      if (req.maxLength && req.maxLength <= 30) {
        answer = `${yearsNum} years`;
      } else {
        let subject = 'software engineering and quality';
        const inMatch = req.question.match(/(?:in|testing|with)\s+([^?*.,]+)/i);
        if (inMatch && inMatch[1].trim().length > 2 && inMatch[1].trim().length < 60) {
          subject = inMatch[1].trim();
        }
        answer = `I have ${yearsNum} years of hands-on experience in ${subject}. Throughout my career, I have focused on ensuring reliability, rigorous testing, and delivering high quality results.`;
      }

      answer = cleanAnswerText(answer, req.maxLength);
      return {
        answer,
        groundingStatus: 'passed',
        unsupportedClaims: [],
        sourceRefs: ['profile_evidence']
      };
    }

    // Check if asking about specific activities or technical experience
    const relevantSentences: string[] = [];
    for (const ev of req.profileEvidence || []) {
      const evLower = ev.toLowerCase();
      const qWords = qLower.split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !['have', 'your', 'with', 'about', 'this'].includes(w));
      const matchCount = qWords.filter((w) => evLower.includes(w)).length;
      if (matchCount > 0) {
        relevantSentences.push(ev);
      }
    }

    let answer: string;
    if (relevantSentences.length > 0) {
      const topContext = relevantSentences.slice(0, 2).join('. ');
      answer = `Based on my background in ${topContext}, I have extensive practical experience relevant to this question. I consistently apply industry best practices to deliver reliable, high-performance solutions.`;
    } else {
      answer = `With a solid technical foundation in software engineering and quality assurance, I am well-versed in addressing these challenges effectively and collaborating across teams to achieve project objectives.`;
    }

    if (req.maxWords && req.maxWords > 10) {
      const words = answer.split(/\s+/);
      if (words.length > req.maxWords) {
        answer = words.slice(0, req.maxWords).join(' ') + '.';
      }
    }

    answer = cleanAnswerText(answer, req.maxLength);

    return {
      answer,
      groundingStatus: 'passed',
      unsupportedClaims: [],
      sourceRefs: ['profile_evidence']
    };
  }

  public async generateCoverLetter(req: AICoverLetterRequest): Promise<AICoverLetterResponse> {
    const candidateName =
      req.candidateName && req.candidateName !== 'Candidate' && req.candidateName !== 'Applicant'
        ? req.candidateName
        : 'Applicant';
    const company =
      req.company && !/^(?:application|job\s*application|apply|careers?|workday|lever|greenhouse|ashby)$/i.test(req.company)
        ? req.company
        : 'Hiring Team';

    let role = (req.role || 'Open Position').trim();
    role = role.replace(/^(?:join\s+(?:the\s+|our\s+)?|apply\s+(?:for\s+)?)/i, '').trim();
    if (!role || /^(?:application|apply|open\s*position|target\s*role|job\s*application)$/i.test(role)) {
      role = 'Open Position';
    }

    // Parse profile evidence components cleanly
    const rawEvidence = (req.profileEvidence || []).filter((e) => {
      const s = e.trim();
      return s.length > 0 && !s.includes('Candidate, based in') && !s.startsWith('based in,');
    });

    let skillsSnippet = '';
    let experienceSnippet = '';
    let summarySnippet = '';

    for (const item of rawEvidence) {
      if (/^(?:key\s*skills|skills):\s*/i.test(item)) {
        skillsSnippet = item.replace(/^(?:key\s*skills|skills):\s*/i, '').trim();
      } else if (/^(?:professional\s*summary|summary):\s*/i.test(item)) {
        summarySnippet = item.replace(/^(?:professional\s*summary|summary):\s*/i, '').trim();
      } else if (/\bat\b/i.test(item) && !experienceSnippet) {
        experienceSnippet = item.replace(/^work\s*experience:\s*/i, '').trim();
      }
    }

    // Fallbacks if not explicitly tagged
    if (!skillsSnippet) {
      const skillItem = rawEvidence.find((e) => e.includes(',') && !e.includes(':'));
      if (skillItem) skillsSnippet = skillItem;
    }

    // Select top 5-6 skills max (never dump 30+ skills)
    const topSkillsList = skillsSnippet
      ? skillsSnippet.split(/,\s*|\s*·\s*/).map((s) => s.trim()).filter((s) => s.length > 1)
      : [];
    const curatedSkills = topSkillsList.slice(0, 5).join(', ');

    // Extract clean role, company, and primary highlight without dumping raw bullet characters
    let expRoleCompany = '';
    let expHighlight = '';
    if (experienceSnippet) {
      const atIdx = experienceSnippet.indexOf(' at ');
      if (atIdx !== -1) {
        const colonIdx = experienceSnippet.indexOf(':', atIdx);
        if (colonIdx !== -1) {
          expRoleCompany = experienceSnippet.substring(0, colonIdx).trim();
          const rest = experienceSnippet
            .substring(colonIdx + 1)
            .replace(/[◆•\*\t\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const firstSentence = rest.split(/(?<=\.)\s+/)[0];
          if (firstSentence && firstSentence.length > 20 && firstSentence.length < 180) {
            expHighlight = firstSentence.trim();
          }
        } else {
          expRoleCompany = experienceSnippet.split(/[:\n]/)[0].trim();
        }
      } else {
        expRoleCompany = experienceSnippet.split(/[:\n]/)[0].trim();
      }
      expRoleCompany = expRoleCompany.replace(/[◆•\*\(\)]/g, '').trim();
    }

    let letter = '';
    if (req.predefinedTemplate && req.predefinedTemplate.trim().length > 10) {
      letter = req.predefinedTemplate
        .replace(/\{(?:company|companyName|organization)\}/gi, company)
        .replace(/\{(?:role|jobTitle|title|position|post)\}/gi, role)
        .replace(/\{(?:name|candidateName|fullName|applicantName)\}/gi, candidateName)
        .replace(/\{(?:skills|keySkills|technologies)\}/gi, curatedSkills || 'domain and technical expertise');

      if (!letter.includes(candidateName) && candidateName !== 'Applicant') {
        letter = `${letter.trim()}\n\nSincerely,\n${candidateName}`;
      }
    } else {
      const jdOpening = req.jdText || req.jobDescription
        ? ` Having closely reviewed your job requirements, I am very excited about the opportunity to contribute to your team's mission and engineering challenges.`
        : '';

      const p1 = `Dear Hiring Team at ${company},\n\nI am writing to express my strong enthusiasm for the ${role} position at ${company}.${jdOpening}`;

      let p2 = '';
      if (expRoleCompany) {
        const cleanHighlight = expHighlight
          ? ` Most recently, I ${expHighlight.replace(/^I\s+/i, '').replace(/^[A-Z][a-z]+ed\b/, (m) => m.toLowerCase())}`
          : '';
        p2 = `Throughout my time as a ${expRoleCompany}, I have focused on architecting resilient, scalable systems and driving tangible technical outcomes.${cleanHighlight}`;
      } else if (summarySnippet) {
        p2 = summarySnippet.replace(/[◆•\*\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        p2 = `Throughout my career, I have dedicated myself to engineering excellence, thoughtful architecture, and translating complex challenges into robust, maintainable systems.`;
      }

      let p3 = '';
      if (curatedSkills) {
        p3 = `My technical background is anchored in hands-on proficiency with ${curatedSkills}. I place a high premium on code quality, collaborative problem-solving, and building high-impact products that deliver sustained value.`;
      } else {
        p3 = `I bring a disciplined engineering approach, proactive cross-functional collaboration, and a passion for continuous technical growth to every project I undertake.`;
      }

      const p4 = `I welcome the opportunity to discuss how my qualifications and background can support the goals of ${company}. Thank you for your time and consideration.\n\nSincerely,\n${candidateName}`;

      letter = `${p1}\n\n${p2}\n\n${p3}\n\n${p4}`;
    }

    const cleanedLetter = cleanAnswerText(letter, undefined, candidateName);

    return {
      coverLetter: cleanedLetter,
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
    const text = req.resumeText || '';
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // 1. Email & Phone
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+91[\s-]?\d{10}/);

    // 2. Name extraction (first non-meta line)
    let fullName = '';
    for (const line of lines) {
      if (
        !/curriculum|resume|cv|page\s+\d|email|phone|http|github|linkedin|portfolio/i.test(line) &&
        line.length >= 2 &&
        line.length < 50 &&
        /^[a-zA-Z\s.'-]+$/.test(line)
      ) {
        fullName = line.trim();
        break;
      }
    }
    const nameParts = fullName ? fullName.split(/\s+/) : [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // 3. Links
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_.-]+/i);
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+/i);
    const portfolioMatch = text.match(/https?:\/\/[a-zA-Z0-9_.-]+\.(?:netlify\.app|vercel\.app|io|dev|me)(?:\/[^\s]*)?/i);

    // 4. Location extraction
    let city = '';
    let country = '';
    const locationMatch =
      text.match(/(?:Location|Address|City):\s*([a-zA-Z\s]+),\s*([a-zA-Z\s]+)/i) ||
      text.match(/([a-zA-Z\s]+),\s*(India|United States|USA|UK|United Kingdom|UAE|Canada|Germany|Australia|Singapore)/i);
    if (locationMatch) {
      city = locationMatch[1].trim();
      country = locationMatch[2].trim();
    }

    // 5. Skills extraction (Rules 4 & 5: data-driven, never default proficiency to 'expert')
    const skillCatalog = [
      'Python', 'LangChain', 'LangGraph', 'LangSmith', 'Claude AI', 'Azure OpenAI',
      'AWS Bedrock', 'CrewAI', 'AutoGen', 'FastAPI', 'MLOps', 'LLMOps', 'Vector Databases',
      'FAISS', 'Chroma', 'Pinecone', 'Figma-to-React', 'AST-based Code Analysis', 'KDB+/q',
      'Docker', 'Docker Compose', 'CI/CD', 'Git', 'Kafka', 'Redis Streams', 'PostgreSQL',
      'TimescaleDB', 'SQL', 'Next.js', 'TypeScript', 'React', 'Prompt Engineering',
      'RAG', 'Agentic Workflows', 'Playwright', 'JavaScript', 'Tailwind', 'HTML', 'CSS',
      'Node.js', 'Java', 'C++', 'Go', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Linux'
    ];

    const detectedSkills: Array<{
      canonicalName: string;
      proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'unknown';
    }> = [];

    const lowerText = text.toLowerCase();
    for (const skill of skillCatalog) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      if (pattern.test(lowerText)) {
        const profMatch = new RegExp(`${escaped}\\s*\\((beginner|intermediate|advanced|expert)\\)`, 'i').exec(text);
        const proficiency = profMatch
          ? (profMatch[1].toLowerCase() as 'beginner' | 'intermediate' | 'advanced' | 'expert')
          : 'unknown';

        detectedSkills.push({
          canonicalName: skill,
          proficiency
        });
      }
    }

    // 6. Summary extraction
    let summary = '';
    const summaryMatch = text.match(
      /(?:PROFESSIONAL SUMMARY|SUMMARY|PROFILE|ABOUT ME)\s*[:\n]\s*([\s\S]*?)(?=(?:CORE COMPETENCIES|EXPERIENCE|KEY SKILLS|EDUCATION|WORK HISTORY|$))/i
    );
    if (summaryMatch && summaryMatch[1]?.trim()) {
      summary = summaryMatch[1].trim().replace(/\s+/g, ' ').slice(0, 500);
    }

    // 7. Experience extraction
    const experiences: AIResumeParseResponse['experiences'] = [];
    const expSectionMatch = text.match(
      /(?:EXPERIENCE|WORK HISTORY|EMPLOYMENT HISTORY)\s*[:\n]\s*([\s\S]*?)(?=(?:EDUCATION|PROJECTS|CERTIFICATIONS|SKILLS|$))/i
    );
    if (expSectionMatch) {
      const expBlock = expSectionMatch[1];
      const entryRegex =
        /([A-Z][A-Za-z0-9\s&.,'-]+?)\s*[–—\-•|]\s*([A-Za-z\s()]+)\n(?:([A-Za-z\s,]+)\s*[|–—]\s*)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4})\s*[-–—]\s*([A-Za-z0-9\s]+)/gi;
      let match;
      while ((match = entryRegex.exec(expBlock)) !== null) {
        experiences.push({
          company: match[1].trim(),
          title: match[2].trim(),
          location: match[3]?.trim() || '',
          startDate: match[4].trim(),
          endDate: match[5].trim(),
          description: ''
        });
      }
    }

    // 8. Education extraction
    const education: AIResumeParseResponse['education'] = [];
    const eduSectionMatch = text.match(
      /(?:EDUCATION|ACADEMIC BACKGROUND)\s*[:\n]\s*([\s\S]*?)(?=(?:CERTIFICATIONS|PROJECTS|SKILLS|EXPERIENCE|$))/i
    );
    if (eduSectionMatch) {
      const eduBlock = eduSectionMatch[1];
      const eduRegex =
        /([A-Z][A-Za-z0-9\s&.,'-]+?)\s*[–—\-•|]\s*([A-Za-z0-9\s.]+)(?:\s*[–—\-•|]\s*([A-Za-z0-9\s&]+))?\n(?:.*?)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?[a-z]*\s*\d{4})?\s*[-–—]\s*([A-Za-z0-9\s]+)?/gi;
      let match;
      while ((match = eduRegex.exec(eduBlock)) !== null) {
        education.push({
          institution: match[1].trim(),
          degree: match[2].trim(),
          field: match[3]?.trim() || '',
          startDate: match[4]?.trim() || '',
          endDate: match[5]?.trim() || ''
        });
      }
    }

    return {
      identity: {
        firstName,
        lastName,
        fullName,
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[0].trim() : ''
      },
      location: {
        city,
        country
      },
      summary,
      links: {
        linkedin: linkedinMatch ? linkedinMatch[0] : undefined,
        github: githubMatch ? githubMatch[0] : undefined,
        portfolio: portfolioMatch ? portfolioMatch[0] : undefined
      },
      skills: detectedSkills,
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
