import { prisma } from "../db/index";
import { Request, Response } from "express";
import bcrypt from "bcrypt";

// Never return the password hash
const userSelect = { id: true, email: true, createdAt: true, updatedAt: true };

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ select: userSelect });
    res.status(200).json({ data: users });
  } catch (error) {
    res.status(500).json({ error });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const user = await prisma.user.findUnique({
      where: { id: id },
      select: userSelect,
    });
    res.status(200).json({ data: user });
  } catch (error) {
    res.status(500).json({ error });
  }
};

export const createUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.create({
      data: { email, password: await bcrypt.hash(password, 10) },
      select: userSelect,
    });
    res.status(201).json({ data: user });
  } catch (error) {
    res.status(500).json({ error });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  const id = req.params.id;
  const { email, password } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: id },
      data: {
        email,
        password: password ? await bcrypt.hash(password, 10) : undefined,
      },
      select: userSelect,
    });
    res.status(200).json({ data: user });
  } catch (error) {
    res.status(500).json({ error });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = req.params.id;
  try {
    const user = await prisma.user.delete({
      where: { id: id },
    });
    res.status(200).json({ msg: `${user.email} eliminado con exito!` });
  } catch (error) {
    res.status(500).json({ error });
  }
};
