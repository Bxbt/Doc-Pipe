import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createProject } from "@/lib/actions";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { getBusinessTypes } from "@/lib/business-types";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const [user, businessTypes] = await Promise.all([getCurrentUser(), getBusinessTypes()]);
  const allowed = canEdit(user);
  const BUSINESS_TYPES = businessTypes.map((b) => b.name);

  async function create(formData: FormData) {
    "use server";
    const id = await createProject({
      name: String(formData.get("name") || "").trim(),
      customer: String(formData.get("customer") || "").trim(),
      businessType: String(formData.get("businessType") || "Generic"),
      description: String(formData.get("description") || "").trim(),
      startDate: String(formData.get("startDate") || ""),
      endDate: String(formData.get("endDate") || ""),
    });
    redirect(`/projects/${id}`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> Projects
      </Link>
      <PageHeader title="New Project" subtitle="Start a connected document pipeline." />

      {!allowed ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
          Your role ({user.role}) cannot create projects. Ask an Admin for Editor access.
        </div>
      ) : (
        <form action={create} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
          <Field label="Project name" required>
            <input
              name="name"
              required
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="e.g. Customer Support Portal"
            />
          </Field>
          <Field label="Customer">
            <input
              name="customer"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="Internal / Client name"
            />
          </Field>
          <Field label="Business type">
            <select
              name="businessType"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <input
                type="date"
                name="startDate"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                name="endDate"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="What is this project about?"
            />
          </Field>
          <button
            type="submit"
            className="self-start rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Create project
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
