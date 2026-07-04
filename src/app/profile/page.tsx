import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  return (
    <div>
      <PageHeader title="Profile" subtitle="Your account details." />
      <ProfileForm user={{ name: user.name, email: user.email, role: user.role }} />
    </div>
  );
}
