import { Router } from 'express';
import {
  createDepartmentHandler,
  deactivateDepartmentHandler,
  getAllDepartments,
  getDepartments,
  reactivateDepartmentHandler,
} from '../controllers/department.controller';
import {
  listMembersHandler,
  reactivateMembershipHandler,
  suspendMembershipHandler,
} from '../controllers/membership.controller';
import { requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createDepartmentSchema,
  departmentParamsSchema,
  membershipParamsSchema,
  pageQuerySchema,
} from '../validators/department.validator';

const router = Router();

const facultyAdmin = requireRole('FACULTY_ADMIN');
const staff = requireRole('FACULTY_ADMIN', 'HOD'); // finer rules (own department only) are enforced in the services

router.get('/', getDepartments); // public: needed by the registration form

router.get('/all', ...facultyAdmin, getAllDepartments);
router.post('/', ...facultyAdmin, validate(createDepartmentSchema), createDepartmentHandler);
router.post('/:departmentId/deactivate', ...facultyAdmin, validate(departmentParamsSchema, 'params'), deactivateDepartmentHandler);
router.post('/:departmentId/reactivate', ...facultyAdmin, validate(departmentParamsSchema, 'params'), reactivateDepartmentHandler);

router.get(
  '/:departmentId/members',
  ...staff,
  validate(departmentParamsSchema, 'params'),
  validate(pageQuerySchema, 'query'),
  listMembersHandler,
);
router.post(
  '/:departmentId/members/:membershipId/suspend',
  ...staff,
  validate(membershipParamsSchema, 'params'),
  suspendMembershipHandler,
);
router.post(
  '/:departmentId/members/:membershipId/reactivate',
  ...staff,
  validate(membershipParamsSchema, 'params'),
  reactivateMembershipHandler,
);

export default router;
