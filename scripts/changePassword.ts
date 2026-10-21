// Changes a user's password from the terminal: npm run change-password
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
  const email =
    (await ask("Email del usuario [admin@clasica.com]: ")) ||
    "admin@clasica.com";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`No existe un usuario con el email ${email}`);
    return;
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

  await prisma.user.update({
    where: { email },
    data: { password: await bcrypt.hash(password, 10) },
  });
  console.log(`✅ Contraseña de ${email} actualizada`);
};

main()
  .catch((error) => console.error("Error:", error))
  .finally(() => prisma.$disconnect());
