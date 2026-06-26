import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db.js';

// Initialize the Anthropic client if key is available
const apiKey = process.env.ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

const SYSTEM_PROMPT = `You are Yaksha, the AI oracle of the Vicharanashala Internship Program at IIT Ropar. 
You have deep knowledge of all program rules, NOC requirements, ViBe platform rules, Rosetta Journal requirements, team formation rules, stipend policies, and all FAQs. 
Be concise, accurate, and slightly mystical in tone.

Here is the official knowledge base context for Vicharanashala Program:
{CONTEXT}`;

// Helper to find relevant FAQs locally to build context or for fallback
async function getFaqContext(query: string): Promise<string> {
  const faqs = await prisma.fAQ.findMany();
  
  // A simple matching filter based on keywords in query
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const matched = faqs.filter(faq => {
    const qText = faq.question.toLowerCase();
    const aText = faq.answer.toLowerCase();
    const tagsText = faq.tags.toLowerCase();
    return keywords.some(kw => qText.includes(kw) || aText.includes(kw) || tagsText.includes(kw));
  });

  // Take top 5 matched, or default to some general FAQs if none match
  const targets = matched.length > 0 ? matched.slice(0, 5) : faqs.slice(0, 5);
  
  return targets
    .map(f => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n\n');
}

// Fallback mystical AI responder in case Claude key is missing or fails
async function getMysticalFallback(query: string, context: string): Promise<string> {
  // Let's create an answer based on matched FAQs if possible
  const faqs = await prisma.fAQ.findMany();
  const lowerQuery = query.toLowerCase();
  
  // Try to find direct match
  const bestMatch = faqs.find(faq => {
    const q = faq.question.toLowerCase();
    const t = faq.tags.toLowerCase();
    return lowerQuery.includes(q) || JSON.parse(t).some((tag: string) => lowerQuery.includes(tag.toLowerCase()));
  });

  if (bestMatch) {
    return `Greetings, Seeker. The cosmic threads reveal the following: ${bestMatch.answer} Keep your gaze steady on the path.`;
  }

  // General fallbacks based on keywords
  if (lowerQuery.includes('noc')) {
    return "Ah, the No Objection Certificate. The oracle sees this: You must upload it via the 'NOC & Documents' block in your User Dashboard by June 10, 2026. A missing NOC shatters the flow of stipend and certificate.";
  }
  if (lowerQuery.includes('stipend') || lowerQuery.includes('paid')) {
    return "Stipends flow to those who complete the weekly Rosetta Journal logs and achieve milestone approvals. The currents release them in the first week of each subsequent month. Satisfy the three participation rules: 85% Zoom presence, 85% response rate, 50% quiz score.";
  }
  if (lowerQuery.includes('roetta') || lowerQuery.includes('journal') || lowerQuery.includes('logs')) {
    return "The Rosetta Journal is your system engineering diary. Record your code commits, readings, and milestones. Submit it every Saturday by 11:59 PM on ViBe, lest the mentors withhold validation of your stipend.";
  }
  if (lowerQuery.includes('vibe') || lowerQuery.includes('platform')) {
    return "ViBe is the sacred workspace of Vicharanashala. Access it on laptop or desktop only. Clear your browser cache and flush your local DNS (ipconfig /flushdns) if portal locked.";
  }
  if (lowerQuery.includes('team') || lowerQuery.includes('size')) {
    return "Teams must have 4 members, assigned or formed according to program rules. Communication occurs via Slack or LinkedIn/Email. WhatsApp groups are forbidden. Inactive members must be reported to mentors.";
  }
  if (lowerQuery.includes('participation') || lowerQuery.includes('zoom') || lowerQuery.includes('quiz')) {
    return "The rolling 5-day evaluation monitors your devotion. You must attend 85% of Zoom sessions, answer 85% of polls, and pass all quizzes with at least 50%. Fall short, and you will be moved to a subsequent batch.";
  }

  return "The oracle's chamber hums with quiet energy. Your query, '" + query + "', is registered. Seek knowledge in the 3D Knowledge Graph or traditional FAQ listings below, and the truth shall manifest.";
}

export async function askYaksha(query: string, userId?: string): Promise<string> {
  const context = await getFaqContext(query);
  
  if (!anthropic) {
    // If no client, use fallback
    return await getMysticalFallback(query, context);
  }

  try {
    const formattedSystem = SYSTEM_PROMPT.replace('{CONTEXT}', context);
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: formattedSystem,
      messages: [
        {
          role: 'user',
          content: query
        }
      ]
    });

    const responseContent = message.content[0];
    if (responseContent && responseContent.type === 'text') {
      return responseContent.text;
    }
    return "The oracle is silent. Try asking in a different manner.";
  } catch (error) {
    console.error("Error communicating with Claude API:", error);
    return await getMysticalFallback(query, context);
  }
}
