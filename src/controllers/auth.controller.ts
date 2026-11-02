import type { NextFunction, Request, Response } from 'express';
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  presentUser,
  registerStudent,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../services/auth.service';
import { CLEAR_COOKIE_OPTS, COOKIE_OPTS, SESSION_COOKIE } from '../utils/token';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await registerStudent(req.body);
    res.status(201).json({
      success: true,
      message: 'Account created. Check your email to verify your address.',
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmailHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await verifyEmail(req.body.token);
    res.status(200).json({ success: true, message: 'Email verified. You can now log in.' });
  } catch (error) {
    next(error);
  }
};

export const resendVerificationHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resendVerification(req.body.email);
    // Same answer whether or not the email exists.
    res.status(200).json({
      success: true,
      message: 'If that account exists and is not verified, a new verification email has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, user } = await login(req.body.email, req.body.password);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
    res.status(200).json({ success: true, message: 'Logged in successfully', data: user });
  } catch (error) {
    next(error);
  }
};

export const logoutUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) {
      await logout(token); // delete the session row...
    }
    res.clearCookie(SESSION_COOKIE, CLEAR_COOKIE_OPTS); // ...and clear the cookie
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getMe = (req: Request, res: Response) => {
  res.status(200).json({ success: true, data: presentUser(req.user!) });
};

export const forgotPasswordHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await forgotPassword(req.body.email);
    // Same answer whether or not the email exists.
    res.status(200).json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

export const resetPasswordHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resetPassword(req.body.token, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password updated. Please log in with your new password.' });
  } catch (error) {
    next(error);
  }
};

export const changePasswordHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await changePassword(req.user!, req.cookies[SESSION_COOKIE], req.body.currentPassword, req.body.newPassword);
    res.status(200).json({ success: true, message: 'Password changed. Your other devices were signed out.' });
  } catch (error) {
    next(error);
  }
};
