import "server-only";
import { isAdminViewer } from "@/lib/auth/viewer";

// Админ = влязъл потребител с profiles.role = 'admin' (задава се автоматично за имейлите в
// ADMIN_EMAILS при влизане или ръчно в базата). Всяка server action в src/app/admin вика requireAdmin().

export async function isAdmin(): Promise<boolean> {
  return isAdminViewer();
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Само за администратори");
}
