import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../services/db.js';
import { askYaksha } from '../services/claude.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { evaluateBadges } from './userRoutes.js';

const router = Router();

// Chat rate limiter: 15 messages per minute
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  message: { error: 'The Oracle is cooling down. Please limit questions to 15 per minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: any) => {
    // Rate limit per user if logged in, otherwise by IP
    return req.user?.id || req.ip || 'anonymous';
  }
});

// POST /api/chat (authenticated and rate limited)
router.post('/', requireAuth, chatLimiter, async (req: AuthRequest, res) => {
  const { message } = req.body;
  const userId = req.user?.id;

  if (!message || !userId) {
    res.status(400).json({ error: 'Message content is required.' });
    return;
  }

  try {
    // Call Yaksha Claude AI
    const reply = await askYaksha(message, userId);

    // Record ChatMessage
    await prisma.chatMessage.create({
      data: {
        userId,
        message,
        response: reply,
      },
    });

    // Award +10 SP for asking Yaksha
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          spurtiPoints: user.spurtiPoints + 10,
        },
      });

      await prisma.activityLog.create({
        data: {
          userId,
          action: 'Ask Yaksha AI',
          xpEarned: 10,
        },
      });

      await prisma.notification.create({
        data: {
          userId,
          message: `Consulted the Oracle. Earned +10 SP.`,
        },
      });

      // Evaluate for "Oracle's Favorite" badge
      await evaluateBadges(userId);
    }

    res.json({ response: reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Server error processing chat request.' });
  }
});

export default router;
