const templates: Record<string, { label: string; template: string }> = {
  default: {
    label: 'Default',
    template: 'Generate an image and caption for the topic: {{topic}}.',
  },
  xhs_note: {
    label: 'XHS Note',
    template:
      'Write a short XHS-style post with a strong hook for the topic \"{{topic}}\". Include 3 key points.',
  },
};

export function renderTemplate(key: string, variables: Record<string, any>) {
  const template = templates[key] || templates.default;
  let result = template.template;
  Object.entries(variables || {}).forEach(([name, value]) => {
    result = result.split(`{{${name}}}`).join(String(value));
  });
  return result;
}

export function listTemplates() {
  return Object.entries(templates).map(([key, value]) => ({
    key,
    label: value.label,
  }));
}
