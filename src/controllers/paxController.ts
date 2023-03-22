import { prisma } from "../db/index";
import { Request, Response } from "express";

export const addPax = async (req: Request, res: Response) => {
  const pax = req.body;
  try {
    const paxData = await prisma.pax.create({
      data: {
        firstname: pax.firstname,
        middlename: pax.middlename,
        lastname: pax.lastname,
        email: pax.email,
        dob: pax.dob,
        obs: pax.obs,
      },
    });
    res.json({ msg: "pax added SUCCESSFULLY", id: paxData.id });
  } catch (error) {
    res.json({ msg: "Error, couldn't add a pax ", error });
    console.log(error);
  }
};

export const getAllPax = async (req: Request, res: Response) => {
  try {
    const paxs = await prisma.pax.findMany();
    res.json({ paxs });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve paxs", error });
    console.log(error);
  }
};

export const getPaxById = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  try {
    const pax = await prisma.pax.findUnique({
      where: {
        id: paxId,
      },
    });

    res.json({ msg: "pax retrieved SUCCESSFULLY", data: pax });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve pax", error });
    console.log(error);
  }
};

export const updatePax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  const updatedpax = req.body;
  try {
    const pax = await prisma.pax.update({
      where: {
        id: paxId,
      },
      data: {
        firstname: updatedpax.firstname,
        middlename: updatedpax.middlename,
        lastname: updatedpax.lastname,
        email: updatedpax.email,
        dob: updatedpax.dob,
        obs: updatedpax.obs,
      },
    });
    res.json({ msg: "pax updated SUCCESSFULLY", data: pax });
  } catch (error) {
    res.json({ msg: "Error, couldn't update pax", error });
    console.log(error);
  }
};

export const deletePax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  try {
    const pax = await prisma.pax.delete({
      where: {
        id: paxId,
      },
    });
    res.json({ msg: "pax deleted SUCCESSFULLY" });
  } catch (error) {
    res.json({ msg: "Error, couldn't delete pax", error });
    console.log(error);
  }
};
