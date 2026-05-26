export interface TemplateInfo {
  id: string;
  label: string;
  example: string;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: "full", label: "name.surname", example: "max.mueller@domain" },
  { id: "first_sur", label: "n+surname", example: "mmueller@domain" },
  { id: "name_num", label: "name+YY", example: "max95@domain" },
  { id: "sur_name", label: "surname.name", example: "mueller.max@domain" },
  { id: "name_city", label: "name.city", example: "max.berlin@domain" },
  { id: "full_year", label: "name.sur+YY", example: "max.mueller95@domain" },
  {
    id: "first_sur_num",
    label: "n+sur+YY",
    example: "mmueller95@domain",
  },
  { id: "underscore", label: "name_surname", example: "max_mueller@domain" },
  { id: "concat", label: "namesurname", example: "maxmueller@domain" },
  { id: "sur_name_year", label: "surname.name+YY", example: "mueller.max95@domain" },
  { id: "name_ddmm", label: "name+DDMM", example: "max1505@domain" },
  { id: "dash", label: "name-surname", example: "max-mueller@domain" },
  { id: "sur_first", label: "surname+n", example: "muellerm@domain" },
];

interface TemplateParams {
  firstName: string;
  lastName: string;
  city?: string;
  birthYear?: string;
}

export function applyTemplate(
  templateId: string,
  params: TemplateParams,
  domain: string,
): string {
  const name = params.firstName.toLowerCase();
  const surname = params.lastName.toLowerCase();
  const first = name[0];
  const yy = params.birthYear ? params.birthYear.slice(-2) : "";
  const city = (params.city ?? "city").toLowerCase();

  let local: string;

  switch (templateId) {
    case "full":
      local = `${name}.${surname}`;
      break;
    case "first_sur":
      local = `${first}${surname}`;
      break;
    case "name_num":
      local = `${name}${yy}`;
      break;
    case "sur_name":
      local = `${surname}.${name}`;
      break;
    case "name_city":
      local = `${name}.${city}`;
      break;
    case "full_year":
      local = `${name}.${surname}${yy}`;
      break;
    case "first_sur_num":
      local = `${first}${surname}${yy}`;
      break;
    case "underscore":
      local = `${name}_${surname}`;
      break;
    case "concat":
      local = `${name}${surname}`;
      break;
    case "sur_name_year":
      local = `${surname}.${name}${yy}`;
      break;
    case "name_ddmm":
      local = `${name}${yy}`;
      break;
    case "dash":
      local = `${name}-${surname}`;
      break;
    case "sur_first":
      local = `${surname}${first}`;
      break;
    default:
      local = `${name}.${surname}`;
  }

  return `${local}@${domain}`.replace(/\s+/g, "");
}

export function getTemplate(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
