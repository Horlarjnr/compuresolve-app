import { Router } from 'express';
import { getDepartments } from '../controllers/department.controller';

const router = Router();

router.get('/', getDepartments); // public: needed by the registration form

export default router;
