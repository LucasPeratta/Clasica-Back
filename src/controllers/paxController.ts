import { log } from "console";
import { prisma } from "../db/index";
import { Request, Response } from "express";

export const addPax = async (req: Request, res: Response) => {
  const pax = req.body;
  try {
    const paxData = await prisma.pax.create({
      data: {
        firstname: pax.firstname,
        lastname: pax.lastname,
        dni: pax.dni,
        passport: pax.passport,
        dob: pax.dob,
        adress: pax.adress,
        email: pax.email,
        phoneNumber: pax.phoneNumber,
        obs: pax.obs,
      },
    });
    res.json({ msg: "Pax added successfully", id: paxData.id });
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(error);
      res
        .status(400)
        .json({ msg: "Error: Email already exists", errorCode: error.code });
    } else {
      res.status(500).json({ msg: "Error, could not add a Pax", error });
    }
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
        lastname: updatedpax.lastname,
        dni: updatedpax.dni,
        passport: updatedpax.passport,
        dob: updatedpax.dob,
        adress: updatedpax.adress,
        email: updatedpax.email,
        phoneNumber: updatedpax.phoneNumber,
        obs: updatedpax.obs,
      },
    });
    res.json({ msg: "pax updated SUCCESSFULLY", data: pax });
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(error);
      res
        .status(400)
        .json({ msg: "Error: Email already exists", errorCode: error.code });
    } else {
      res.status(500).json({ msg: "Error, could not update a Pax", error });
    }
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
