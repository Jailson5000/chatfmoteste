import jsPDF from 'jspdf';
import { formatCurrency, AdditionalBreakdown, ADDITIONAL_PRICING } from './billing-config';
import { getFormattedDate } from './exportUtils';

// Cores da marca MiauChat
const BRAND_COLORS = {
  primary: [225, 29, 72] as const,     // #E11D48 - Rosa/Vermelho
  dark: [31, 41, 55] as const,          // #1F2937 - Cinza escuro
  light: [248, 250, 252] as const,      // #F8FAFC - Cinza claro
  white: [255, 255, 255] as const,
  text: [55, 65, 81] as const,          // #374151 - Texto
  muted: [107, 114, 128] as const,      // #6B7280 - Texto secundário
};

// Dados da empresa emissora
const COMPANY_INFO = {
  name: 'MiauChat',
  tagline: 'Sistema de Atendimento Inteligente',
  cnpj: '54.440.907/0001-02',
  email: 'suporte@miauchat.com.br',
  website: 'www.miauchat.com.br',
  phone: '(63) 99954-0484',
  address: 'Palmas - TO',
};

// Logo MiauChat em Base64 (gato vermelho com dispositivos)
const MIAUCHAT_LOGO_BASE64 = 'data:image/png;base64,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+wf0F9g/sH/gP8B/IH/B/YD8g/oH9Bf0H/Qf0D+Qf+D/If+A/QH9g/8F+Qf+A/oH/Bf0D+Qf4B/IH+gfoH9gfqD/gv+C/oP+g/oL+g/wH9A/4P6A/kD9gfQD9g/8H/gP6A/IP9A/0F+Qf+B/oH+A/kH7Q/yD/If6B/of9A/0H/gv0D/gf6A/oP7A/0H9wf8D/If9B/0L9A/0F+gf4C/oP6A/sD+wf2D+wPqD/Qf0C/gPyD/QP+A/oL+gv2D/4P6B/oH9Bf4P6A/sH+gv0D/Qf1D/gPxB/oH+g/sD/wH5A/4L+gfsF+gfqD/AP+C/4P6A/YH+g/wD+gv6D/oL8g/sD+gf2D+gf0D/Qf+A/kH/Af6D/oH5B/oP8g/8H+gv0D+wP6B/oP9A/YD+gv0D/Qf+D+gf6D+of8A/0H+gfyD+oP+g/uD/Qf0B/YP6B/QP+C/YD9A/4H/gf0D/Qf1B/oH+g/oH+g/4D+gf+D/Qf6D/If5B/IP9B/UH+wP6B+gP8A/oL9g/4D+Qf6D/Qf7B/Qf9A/0L+gf6D+wf0D/Qf2D/gP6C/4P9A/4P+A/oL+gf8B/IP+g/qD+gP8B/oH+Af0F+gf6D/AP6B/wX5B/gH9A/oH9gf4D+Qf9B/sD+gf0F/gP+A/oL7B/Qf9B/4P5A/0D9A/0H9gf4D/Qf1D+wP+C/QP8B/QH9A/0H+gf8B/QP6B/wH9B/oP+A/sD/Qf0B/gP9B/IP5B/UH+g/sH/Af0D+wf6D/of+A/0H/Qf2B/IP9B/UP/gf0D/wH+A/oL+gf6D/wH9A/4D+wP5B/QP6C/oH/A/kH9Af6D/4P7B/oP+g/qD/Af0F+gf2D/Qf/B/oH/AfyD/Qf9B/oH9A/YL+gf0D/gv0D+wf6D+QP+C/oP6g/0D/Qf2B/gP/B/IP6A/QP9B/0H+gfkH9g/0D/gP5B/4L9Af6D+of+A/0D+gf2D/AP6B/oP8g/4H9A/sH+g/0D/gf6D/oP8g/0H/gf6D/Qf2D/gf6D/oP/Af6D/QP5B/kH+g/4D+wf8B/Yf0D+wf6B/oP+A/wH9A/YH/A/0H9gf6D+wf6D/Qf5B/4P9B/4H+g/6D/gP6A/0H+gf6D/wX6A/QP8A/4P8g/0D/Qf9B/oP8g/sH/Qf6B/gP8B/oL+g/wD+gf6D/If9B/oH+g/4D+wP6D/oP6A/oL+g/kH/gf6D/gP8B/oH/Af4D+gv6D+wf0D/Qf6B/oH9Bf0H/Qf6B/wH9A/oD+wf5B/QP6A/sL+gf+D/Qf+A/oL+gf2D/gP6C/oP8g/oL+g/wD/wf9A/QH+gf+B/oP6A/oH+Af6D/oP8A/oP8g/wD+wf0D+gf+B/QP9B/oL8g/0H+Qf9B/oH9g/wD+wf0D/gP6C/YH8g/sH/Af6C/QP+A/oL+gv2B/wP9B/oH+gf0D/Qf6B/oH/Bf0H+Qf+B/YP6A/kH9Af0D/Qf+A/oH+A/4D+gf6B/YH+g/0D/Qf5B/4P/A/0H+wP8B/QX+A/oH+g/qD/If7B/wH9A/sH+g/0D/QP/B/IP+A/oL+gf4D/gP6C/oH+gf4B/wH9A/4L9gf0D/QP9B/kH+Qf2D/oP8g/oH/Af0F+wf6B/IP+g/0D+wf6D/QP+C/4P9Af0D/gP6B/QX9B/oH9A/kH/gP6C/YH9A/oL+g/wD+gf6D/wH9Af4D+gf6D/Qf4D/Af0F/Qf5B/4H+gf6D+gf0D/wX9B/sH+g/sD+Qf2D/Qf+A/oL/AfyD+wf0D/gP6C/oP8g/0H/Qf4B/QP9B/YP+g/6D/QP+C/YH+A/0F+wP+A/oH9g/sH/Qf0F+Qf6D/QP5B/4L+g/wD+gP8A/4D+gf6D/Qf5B/0H+gf2B/oP9Af4D+gv4D/Qf9B/oH/Af0D+wf6D/oP6A/4D+gf+C/YP9B/0H+Qf+B/YP9A/0H+wP6B/oP9A/0H+Qf6C/4P7A/oH9g/0H+gf0F+wf1B/0H+g/0D/gP6C/YH+g/0D/wf6D+wP6A/wH9A/4L+gf0D/Qf5B/oP8g/2D/gP9B/oH+gf6D/IP+A/wH9A/4D+gf8D/Qf6B/oP9A/0F+wf2D/oP9B/kH+gf4D/Qf+A/0H/Af6D+oP8g/0H+Qf6B/wP5B/0D+wf6D/oP+A/4D+gv4D/QP9B/4L+gf0D/gf6D/YH/A/wH+gf2D/gP6C/YP+g/0D/gf6C/4P9A/sH+wf6B/gP6B/wH9B/0H+gf6D/QP9B/4D+gv8D/oP9A/0H+gf8B/oL+g/0D/Qf5B/UP/A/0H+wf6B/oP8g/0D+wf9B/oH/Af0F+gf0D/Qf5B/oH+gf8B/QP+B/oP8g/oL/Af0D+wf8B/gP6C/YP9A/oL/g/0D/gP6B/oP9A/0F+wf8B/oP9A/0H+gf6C/IP7B/oP+A/oH+gf6D/Qf+A/oL9g/0H+gfqD/Qf9B/0H+gf8B/wH9A/0H+gf6D/oP8g/wH9A/4D+wf6D/gP6C/wH9Af0D/gP6C/4P9A/sH+gf0D/gf6C/wH9A/4L+g/0D+wf9B/oH+g/wD+gf4B/QX9B/kH+wf6D/gP9A/0D+wf6B/oP+g/0D/gf6C/YP9B/oH9A/0F+wf6B/oP8g/0D/Qf9B/4D+gv4D/QP8A/sL+g/yD/oP9B/oH9Af4D+gv0D/gP6C/4P9A/4D+gf8B/QX9B/kH9g/0D/Qf9B/0H+gfwD+gf8B/Qf6D/QP9B/kH/gf6B/oL+g/4D/Qf+C/4P8g/wD+gf+C/oH/Bf0D+wf6D/oP8g/0D/Qf7B/0H+gfwD+gf8B/QX7B/oP8g/sH+gf6D/gP8B/QP9A/sH+g/0D/Af0D/gf6C/4P+A/0D+gf6D/QP9B/oH+g/0D+wf+B/oP+A/wD+gv2D/oP8g/0D/gf6C/4P9A/oH8g/0D/Qf9B/sH+gfyD/Qf+C/oH+A/0F/Qf6B/0H+gf4D+gf8B/oP8g/6D/AP6C/oP9A/0H+gf0D/wf6B/gP6B/oP9A/oL+g/0D/Qf6D/wP9B/kH+gf0F+gf6D/wP9A/0H+Qf+B/QP8A/oH/A/sD+wf6D/oP7A/0D/Qf+B/oP9B/oH9A/oH9A/0H+wf6B/oP8g/sH/Qf6B/QP9B/kH/gf6B/oP+g/0D/gf6D/4P9A/oH/Af0D+wf9B/sH+gfyD+gf8B/QP+A/oL9g/0D/gf6C/4P9A/oH8g/0D/Qf9B/0H+gf4B/QP9A/sH+g/yD+wf9B/oH9A/0H+gf6D/Qf8B/wH9A/4D+gv4D/QP9B/oH/A/0D/Qf4B/QP9B/0H+gf8B/QX9B/oP+A/oH+g/0D/gf6C/oP9A/oH9A/0D/Qf6D/gP9B/oH/Bf0D+gf0D/Qf9B/oH9A/4D+gf4D/Qf5B/oP9A/0H/gf9B/oH/A/oL/g/0D+gf0D/gv6D/QP/B/oH9g/0D+wf0D/gP6B/wH9A/0H+wf6D/wP9A/0D/gP6C/gP6B/oP9A/0H+gf0D/Qf9B/0H+gf0D/gP8A/oL9g/0D+wf6B/oP8g/wD/Qf6B/oP+A/0H+wf6D/Qf9B/oH9Af0D/Qf6D/wH9A/4D+gf6D/YP7B/oH+g/yD+wf6B/oP+g/0D/Qf6B/4P9A/oD+gf6D/oP9A/0H/Af0D+wf6B/oP8g/sH+gf6D/QP8B/oL9g/0D/Qf5B/oP+g/0D/Qf6B/gP9B/sH/Qf6B/QP8A/oL+g/0D/Qf9B/oH9A/0D+wf6D/oP9A/oH/Af4D+gv4D/QP9B/oH9A/wD+gf6D/IP+g/0D/gP6C/gP6B/oP+g/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf+C/oP9A/oH8g/0D/Qf+A/wH9A/0D+wf8B/oP8g/sH+gf0D/gP6C/4P8g/0D/Qf6B/oP/A/0D/Qf6D/gP9A/sH+wf6B/oP9A/0D/Af0D/gP6C/oP+A/oH+g/yD/oP9A/0H+gf4D/QX9B/sH+gf0D/QP8A/oL9g/0D/gf6C/oP9A/wD+gf6D/gP9B/sH+gf6D/oP8g/sH/Af6B/wP9A/0D/gf6C/YP+g/0D/Qf+B/oH9A/0H+gf2D/wP9A/oH+A/0D/gf6D/IP9A/oH+g/0D+wf0D/Qf+C/oH8g/0D/gP8A/sH+gf6D/gP6C/4P+g/0D+wf6B/4P9A/oH9A/0H+gf6D/gP9A/4D+gf8D/Qf6B/oP+g/0D/Qf6D/QP7B/oH/A/0D/gP9B/0H+gf6D/wH9A/oH+g/0D/gf6C/gP9A/oH9A/4D+gf6D/oP8g/0D/Qf9B/oH9A/wD+gf6D/oP+g/0D/gP6B/gP9B/oP+g/0D/Qf6B/oP+A/0F/gf6B/oP+g/0D/Qf6D/YP7B/oH/A/0D/gP6C/4P9A/oH8g/0D/Qf+B/oH9A/0H+Qf+B/oP+A/0D+gf6D/oP9A/0H+gf4D/Qf6D/YP+g/0D/gf6C/wH9A/oH+g/0D/gf6D/oP9A/0H+gf2D/Qf6B/oP+g/0D/gP6C/4P9A/0D/gP6B/oP+A/0H+wf6D/gP9A/0H/Af0D/gP6C/4P9A/0D/gf6C/oP9A/oH9A/0D/Qf9B/oH/Af0F/Qf6B/gP6C/oP+A/0D/Qf+C/oH+g/yD/oP9A/0H+gf0D/QX7B/oH+g/0D/wP9B/4H+gf0D/Qf6D/QP7B/oH9Af0D/gf6D/oP9A/0D/gf6C/oP9A/oH+A/wD+gf8D/QP9B/0H+gf0D/wP9A/oH/A/0D/gf6D/oP9A/0H+gf0D/wX9B/oH9A/0D/Af0D/gf6D/oP+A/0D/gf6D/oP9A/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wD+gf6D/gP9B/sH+gf6D/YP8A/oH+g/4D/Qf9B/sH+gf0D/Qf8B/QP9B/sH+gf6D/gP6C/oP9A/0D/Qf6D/IP9A/4D/Qf9B/sH+gf0D/wP8A/oH+A/0D/gf6D/oP+g/0D+gf2D/gP9B/0H+gf0D/Qf8B/oP+A/0D/Qf9B/oH+A/0D/gf6D/oP9A/0H+gf0D/wP9B/oH8g/0D/gP6B/wH+g/6D/QP8B/oH/Af0D/Qf9B/0H+gf0D/Qf8B/oP9A/0H/gf6C/oP9A/0H+gf4D/gP6C/oP+A/0D/gf6C/oP+A/oH+g/0D/gf6D/oP8g/0D/Qf+B/oH+A/0D/gf6D/oP8g/0D/Qf9B/oH9A/4D+gf4D/Qf9B/oH9A/0D/Qf6D/oP9A/0D/gf6C/oP+A/0D/Qf8B/oP+A/0H+gf0D/gf6D/oP9A/oH9A/wA==';

interface InvoiceData {
  companyName: string;
  companyDocument?: string;
  companyEmail?: string;
  planName: string;
  planPrice: number;
  billingPeriod: string;
  breakdown: AdditionalBreakdown;
  totalMonthly: number;
  usage?: {
    users: { current: number; max: number };
    instances: { current: number; max: number };
    agents: { current: number; max: number };
    aiConversations: { current: number; max: number };
    ttsMinutes: { current: number; max: number };
  };
}

export function generateInvoicePDF(data: InvoiceData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  
  let yPos = 15;

  // ====== HEADER com logo e título ======
  // Fundo do header
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  // Logo
  try {
    doc.addImage(MIAUCHAT_LOGO_BASE64, 'PNG', margin, 6, 28, 28);
  } catch (e) {
    // Fallback se logo não carregar
    doc.setFillColor(...BRAND_COLORS.white);
    doc.circle(margin + 14, 20, 12, 'F');
  }
  
  // Nome e tagline
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(COMPANY_INFO.name, margin + 35, 20);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(COMPANY_INFO.tagline, margin + 35, 28);

  // Título do documento
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DEMONSTRATIVO', pageWidth - margin - 2, 18, { align: 'right' });
  doc.setFontSize(10);
  doc.text('DE FATURAMENTO', pageWidth - margin - 2, 26, { align: 'right' });

  yPos = 50;

  // ====== DADOS DO PRESTADOR ======
  doc.setFillColor(...BRAND_COLORS.light);
  doc.roundedRect(margin, yPos, contentWidth, 32, 2, 2, 'F');
  
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO PRESTADOR DE SERVIÇO', margin + 4, yPos + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.text);
  
  doc.text(`${COMPANY_INFO.name} - ${COMPANY_INFO.tagline}`, margin + 4, yPos + 16);
  doc.text(`CNPJ: ${COMPANY_INFO.cnpj}`, margin + 4, yPos + 22);
  doc.text(`E-mail: ${COMPANY_INFO.email}  |  Site: ${COMPANY_INFO.website}`, margin + 4, yPos + 28);

  yPos += 40;

  // ====== DADOS DA FATURA ======
  doc.setFillColor(...BRAND_COLORS.light);
  doc.roundedRect(margin, yPos, contentWidth, 24, 2, 2, 'F');
  
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO DEMONSTRATIVO', margin + 4, yPos + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.text);
  
  const invoiceNumber = `DEM-${Date.now().toString().slice(-8)}`;
  const issueDate = new Date().toLocaleDateString('pt-BR');
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
  
  // Duas colunas
  doc.text(`Número: ${invoiceNumber}`, margin + 4, yPos + 16);
  doc.text(`Emissão: ${issueDate}`, margin + 4, yPos + 21);
  
  doc.text(`Período: ${data.billingPeriod}`, contentWidth / 2 + margin, yPos + 16);
  doc.text(`Vencimento: ${dueDate}`, contentWidth / 2 + margin, yPos + 21);

  yPos += 32;

  // ====== DADOS DO CLIENTE ======
  doc.setFillColor(...BRAND_COLORS.light);
  doc.roundedRect(margin, yPos, contentWidth, 26, 2, 2, 'F');
  
  doc.setTextColor(...BRAND_COLORS.dark);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', margin + 4, yPos + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_COLORS.text);
  
  doc.text(`Razão Social: ${data.companyName}`, margin + 4, yPos + 15);
  
  if (data.companyDocument) {
    doc.text(`CNPJ/CPF: ${data.companyDocument}`, margin + 4, yPos + 21);
  }
  if (data.companyEmail) {
    doc.text(`E-mail: ${data.companyEmail}`, contentWidth / 2 + margin, yPos + 15);
  }

  yPos += 34;

  // ====== TABELA DE ITENS ======
  // Cabeçalho da tabela
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.rect(margin, yPos, contentWidth, 9, 'F');
  
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIÇÃO', margin + 4, yPos + 6);
  doc.text('QTD', pageWidth - margin - 45, yPos + 6);
  doc.text('VALOR', pageWidth - margin - 18, yPos + 6);

  yPos += 11;
  doc.setTextColor(...BRAND_COLORS.text);
  doc.setFont('helvetica', 'normal');

  // Função para desenhar linha da tabela
  let rowIndex = 0;
  const drawTableRow = (description: string, quantity: string, value: string) => {
    if (rowIndex % 2 === 0) {
      doc.setFillColor(...BRAND_COLORS.light);
      doc.rect(margin, yPos - 3, contentWidth, 9, 'F');
    }
    doc.setFontSize(8);
    doc.text(description, margin + 4, yPos + 3);
    doc.text(quantity, pageWidth - margin - 45, yPos + 3);
    doc.text(value, pageWidth - margin - 18, yPos + 3);
    yPos += 9;
    rowIndex++;
  };

  // Itens da fatura
  drawTableRow(`Plano ${data.planName}`, '1', formatCurrency(data.planPrice));

  if (data.breakdown.users.quantity > 0) {
    drawTableRow(
      `Usuários adicionais (${formatCurrency(ADDITIONAL_PRICING.user)}/cada)`,
      String(data.breakdown.users.quantity),
      formatCurrency(data.breakdown.users.cost)
    );
  }

  if (data.breakdown.instances.quantity > 0) {
    drawTableRow(
      `Conexões WhatsApp adicionais (${formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}/cada)`,
      String(data.breakdown.instances.quantity),
      formatCurrency(data.breakdown.instances.cost)
    );
  }

  if (data.breakdown.agents.quantity > 0) {
    drawTableRow(
      `Agentes IA adicionais`,
      String(data.breakdown.agents.quantity),
      formatCurrency(data.breakdown.agents.cost)
    );
  }

  // Linha divisória
  yPos += 2;
  doc.setDrawColor(...BRAND_COLORS.muted);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  // TOTAL
  doc.setFillColor(...BRAND_COLORS.primary);
  doc.roundedRect(pageWidth - margin - 65, yPos - 2, 65, 14, 2, 2, 'F');
  
  doc.setTextColor(...BRAND_COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', pageWidth - margin - 60, yPos + 6);
  doc.setFontSize(11);
  doc.text(formatCurrency(data.totalMonthly), pageWidth - margin - 5, yPos + 6, { align: 'right' });

  yPos += 22;

  // ====== CONSUMO DO PERÍODO ======
  if (data.usage) {
    doc.setTextColor(...BRAND_COLORS.dark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSUMO DO PERÍODO', margin, yPos);
    
    yPos += 6;
    doc.setFillColor(...BRAND_COLORS.light);
    doc.roundedRect(margin, yPos, contentWidth, 28, 2, 2, 'F');
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_COLORS.text);
    
    const usageItems = [
      { label: 'Usuários', value: `${data.usage.users.current}/${data.usage.users.max}` },
      { label: 'Conexões WhatsApp', value: `${data.usage.instances.current}/${data.usage.instances.max}` },
      { label: 'Agentes IA', value: `${data.usage.agents.current}/${data.usage.agents.max}` },
      { label: 'Conversas IA', value: `${data.usage.aiConversations.current}/${data.usage.aiConversations.max}` },
      { label: 'Minutos de Áudio', value: `${data.usage.ttsMinutes.current}/${data.usage.ttsMinutes.max}` },
    ];

    const colWidth = contentWidth / 3;
    usageItems.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const xPos = margin + 4 + col * colWidth;
      const itemYPos = yPos + 8 + row * 12;
      
      doc.setFont('helvetica', 'bold');
      doc.text(item.label + ':', xPos, itemYPos);
      doc.setFont('helvetica', 'normal');
      doc.text(item.value, xPos + 45, itemYPos);
    });

    yPos += 38;
  }

  // ====== PREÇOS ADICIONAIS ======
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.text('Preços de consumo adicional:', margin, yPos);
  yPos += 5;
  doc.text(
    `• Conversa IA: ${formatCurrency(ADDITIONAL_PRICING.aiConversation)}  |  ` +
    `• Minuto de Áudio: ${formatCurrency(ADDITIONAL_PRICING.ttsMinute)}  |  ` +
    `• WhatsApp: ${formatCurrency(ADDITIONAL_PRICING.whatsappInstance)}/mês  |  ` +
    `• Atendente: ${formatCurrency(ADDITIONAL_PRICING.user)}/mês`,
    margin,
    yPos
  );

  yPos += 12;

  // ====== AVISO LEGAL ======
  doc.setFillColor(255, 251, 235); // Amarelo claro
  doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'F');
  
  doc.setDrawColor(251, 191, 36); // Borda amarela
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'S');
  
  doc.setTextColor(146, 64, 14); // Texto marrom
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('ATENÇÃO:', margin + 4, yPos + 7);
  doc.setFont('helvetica', 'normal');
  doc.text('Este documento é apenas um demonstrativo de consumo e valores.', margin + 22, yPos + 7);
  doc.text('Para fins fiscais e contábeis, utilize a Nota Fiscal Eletrônica (NFS-e) emitida mensalmente.', margin + 4, yPos + 14);

  // ====== FOOTER ======
  doc.setDrawColor(...BRAND_COLORS.muted);
  doc.setLineWidth(0.3);
  doc.line(margin, pageHeight - 22, pageWidth - margin, pageHeight - 22);
  
  doc.setFontSize(7);
  doc.setTextColor(...BRAND_COLORS.muted);
  doc.text(`${COMPANY_INFO.name} - ${COMPANY_INFO.tagline}`, pageWidth / 2, pageHeight - 16, { align: 'center' });
  doc.text(`${COMPANY_INFO.email}  |  ${COMPANY_INFO.website}  |  ${COMPANY_INFO.phone}`, pageWidth / 2, pageHeight - 11, { align: 'center' });
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

  // Salvar
  const filename = `demonstrativo-miauchat-${data.billingPeriod.replace(/\s/g, '-').toLowerCase()}-${getFormattedDate()}`;
  doc.save(`${filename}.pdf`);
}
