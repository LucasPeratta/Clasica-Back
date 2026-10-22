// Changes a user's password from the terminal: npm run change-password
// If the user doesn't exist yet (e.g. a new, empty database) it offers to create it
// Uses the database in DB_CONNECTION_STRING (.env)
import readline from "readline";
import bcrypt from "bcrypt";
import { prisma } from "../src/db/index";

const ask = (question: string, hidden = false): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    // Hide what is typed for passwords
    (rl as any)._writeToOutput = (text: string) => {
      if (!muted) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });

const main = async () => {
  const email = (
    (await ask("Email del usuario [admin@clasica.com]: ")) || "admin@clasica.com"
  ).toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const create = await ask(`No existe un usuario con el email ${email}. ¿Lo creo? (s/n): `);
    if (create.toLowerCase() !== "s") return;
  }

  const password = await ask("Nueva contraseña (mínimo 8 caracteres): ", true);
  if (password.length < 8) {
    console.log("La contraseña tiene que tener al menos 8 caracteres. No se cambió nada.");
    return;
  }

  const repeated = await ask("Repetí la contraseña: ", true);
  if (password !== repeated) {
    console.log("Las contraseñas no coinciden. No se cambió nada.");
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { password: hashed },
    create: { email, password: hashed },
  });
  console.log(user ? `✅ Contraseña de ${email} actualizada` : `✅ Usuario ${email} creado`);
};

main()
  .catch((error) => console.error("Error:", error))
  .finally(() => prisma.$disconnect());
