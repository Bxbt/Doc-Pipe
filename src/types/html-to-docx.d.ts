declare module "html-to-docx" {
  // Minimal typing for the POC. Returns a Buffer in Node.
  export default function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: Record<string, unknown>,
    footerHTMLString?: string | null
  ): Promise<Buffer>;
}
