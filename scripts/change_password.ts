import * as readline from "readline";
import * as UserService from "../src/users/user.services";
import { db } from "../src/utils/db.server";
import { User } from "../src/users/user.utils";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const question = (prompt: string): Promise<string> =>
  new Promise((resolve) => rl.question(prompt, resolve));

const changePassword = async () => {
  try {
    // Obtener todos los usuarios de la base de datos (incluyendo ADMIN y COORDINATOR)
    const users = await db.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, personId: true, role: true },
    });

    if (users.length === 0) {
      console.log("No hay usuarios en la base de datos.");
      rl.close();
      process.exit(0);
      return;
    }

    console.log("\n--- Usuarios ---\n");
    users.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.name} (cédula: ${user.personId}, rol: ${user.role})`);
    });
    console.log("");

    const numStr = await question("Ingrese el número del usuario al que desea cambiar la clave: ");
    const index = parseInt(numStr.trim(), 10);

    if (isNaN(index) || index < 1 || index > users.length) {
      console.log("Número inválido. Debe elegir un número entre 1 y", users.length);
      rl.close();
      process.exit(1);
    }

    const selectedUser = users[index - 1];
    console.log(`\nUsuario seleccionado: ${selectedUser.name} (${selectedUser.personId})\n`);

    const newPassword = await question("Ingrese la nueva contraseña (mínimo 8 caracteres): ");
    if (newPassword.length < 8) {
      console.log("La contraseña debe tener al menos 8 caracteres.");
      rl.close();
      process.exit(1);
    }

    const confirmPassword = await question("Confirme la nueva contraseña: ");
    if (newPassword !== confirmPassword) {
      console.log("Las contraseñas no coinciden.");
      rl.close();
      process.exit(1);
    }

    const confirm = await question(
      `¿Confirmar cambio de clave para ${selectedUser.name}? (s/n): `
    );
    if (confirm.trim().toLowerCase() !== "s" && confirm.trim().toLowerCase() !== "si") {
      console.log("Operación cancelada.");
      rl.close();
      process.exit(0);
    }

    await UserService.updateuser(selectedUser.id, { password: newPassword });
    console.log("\n✓ Contraseña actualizada correctamente en la base de datos.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
};

changePassword();
