import type { NextFunction, Request, Response } from 'express';
import { createCategory, listCategories, setCategoryActive } from '../services/category.service';
import type { ListCategoriesQuery } from '../validators/category.validator';

export const listCategoriesHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await listCategories(req.user!, res.locals.query as ListCategoriesQuery);
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

export const createCategoryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await createCategory(req.user!, req.body);
    res.status(201).json({ success: true, message: 'Category created', data: category });
  } catch (error) {
    next(error);
  }
};

export const deactivateCategoryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await setCategoryActive(req.user!, req.params.categoryId as string, false);
    res.status(200).json({ success: true, message: 'Category deactivated', data: category });
  } catch (error) {
    next(error);
  }
};

export const reactivateCategoryHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await setCategoryActive(req.user!, req.params.categoryId as string, true);
    res.status(200).json({ success: true, message: 'Category reactivated', data: category });
  } catch (error) {
    next(error);
  }
};
