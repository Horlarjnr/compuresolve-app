import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealth); // 200 { success, data: { status, timestamp } }

export default router;
