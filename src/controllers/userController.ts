import { prisma } from "../db/index";
import { Request, Response } from "express";

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany();
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
      data: { email, password },
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
      data: { email, password },
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
