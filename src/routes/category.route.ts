import { Router } from 'express';
import {
  createCategoryHandler,
  deactivateCategoryHandler,
  listCategoriesHandler,
  reactivateCategoryHandler,
} from '../controllers/category.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  categoryParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
} from '../validators/category.validator';

const router = Router();

const managers = requireRole('FACULTY_ADMIN', 'HOD'); // a HOD is limited to their own department in the service

router.get('/', requireAuth, validate(listCategoriesQuerySchema, 'query'), listCategoriesHandler);
router.post('/', ...managers, validate(createCategorySchema), createCategoryHandler);
router.post('/:categoryId/deactivate', ...managers, validate(categoryParamsSchema, 'params'), deactivateCategoryHandler);
router.post('/:categoryId/reactivate', ...managers, validate(categoryParamsSchema, 'params'), reactivateCategoryHandler);

export default router;
