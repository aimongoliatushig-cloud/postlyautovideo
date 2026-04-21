import "server-only";

import type { DoctorVisualPlan, GeneratedScript } from "@/lib/types";
import { trimText } from "@/lib/utils";
import {
  generateDoctorPlanWithOpenAi,
  generateScriptWithOpenAi,
} from "./openai-script-client";

type TopicProfile = {
  mnName: string;
  enName: string;
  warning: string;
  problem: string;
  cause: string;
  solution: string;
  consequence: string;
};

const profiles: Record<string, TopicProfile> = {
  элэг: {
    mnName: "Элэг",
    enName: "liver",
    warning: "өөхжилт, ферментийн өөрчлөлт, архаг үрэвсэл",
    problem: "элэг ачааллаа дуугүй үүрдэг тул шинж тэмдэг орой илэрдэг",
    cause: "архины хэт хэрэглээ, чихэрлэг хүнс, таргалалт, хөдөлгөөний дутагдал",
    solution: "хоолны дэглэм, жингийн хяналт, шинжилгээ, эмчийн хяналт",
    consequence: "цирроз, бодисын солилцооны хүндрэл, амархан ядрах",
  },
  зүрх: {
    mnName: "Зүрх",
    enName: "heart",
    warning: "цээжээр өвдөх, амьсгаадах, даралт савлах",
    problem: "зүрхний ачаалал өсөх үед бүх биеийн цусны эргэлт алдагддаг",
    cause: "стресс, даралт ихсэх, тамхи, хөдөлгөөний дутагдал",
    solution: "үзлэг, идэвхтэй хөдөлгөөн, даралт хяналт, давс багасгах",
    consequence: "зүрхний шигдээс, хэм алдагдал, архаг сульрал",
  },
  бөөр: {
    mnName: "Бөөр",
    enName: "kidney",
    warning: "хаван, шээсний өөрчлөлт, ядрах",
    problem: "бөөр шингэн ба хорыг зохицуулдаг тул удаан ачаалалд ордог",
    cause: "ус бага уух, даралт ихсэх, чихрийн шижин, халдвар",
    solution: "шингэний зөв хэрэглээ, шинжилгээ, давс багасгах, эмчид үзүүлэх",
    consequence: "архаг дутагдал, хаван, даралт хяналтгүй болох",
  },
  уушги: {
    mnName: "Уушги",
    enName: "lungs",
    warning: "амьсгаадах, ханиалгах, цээж давчдах",
    problem: "уушгины үйл ажиллагаа муудахад хүчилтөрөгч бүх биед багасдаг",
    cause: "агаарын бохирдол, тамхи, халдвар, хөдөлгөөнгүй байдал",
    solution: "амьсгалын дасгал, эмчилгээ, орчны эрсдэлийг багасгах",
    consequence: "архаг бөглөрөлт өвчин, сульдах, амьсгалын дутагдал",
  },
};

function getProfile(topic: string): TopicProfile {
  const normalized = topic.trim().toLowerCase();

  return (
    profiles[normalized] ?? {
      mnName: trimText(topic.trim() || "Эрүүл мэнд", 28),
      enName: topic.trim().toLowerCase() || "health",
      warning: "эрт анзаарах ёстой шинж тэмдэг",
      problem: "асуудал удаан хугацаанд анзаарагдахгүй хүндэрч болдог",
      cause: "өдөр тутмын буруу дадал, хяналт сулрах, урьдчилан сэргийлэлт дутмаг байх",
      solution: "эрт үзлэг, оношилгоо, амьдралын хэв маягийн өөрчлөлт",
      consequence: "архаг хүндрэл ба амьдралын чанар буурах эрсдэл",
    }
  );
}

export async function buildExplainerScript(topic: string): Promise<GeneratedScript> {
  const profile = getProfile(topic);

  try {
    const generated = await generateScriptWithOpenAi({
      mode: "explainer",
      topic: profile.mnName,
      segmentCount: 3,
    });

    if (generated) {
      return {
        mode: "explainer",
        topic: generated.topic,
        title: generated.title,
        hook: generated.hook,
        problem: generated.problem,
        cause: generated.cause,
        solution: generated.solution,
        cta: generated.cta,
        fullText: [
          generated.hook,
          generated.problem,
          generated.cause,
          generated.solution,
          generated.cta,
        ].join(" "),
        segments: generated.segments,
      };
    }
  } catch (error) {
    console.error("OpenAI explainer script generation failed, falling back.", error);
  }

  const hook = `${profile.mnName} асуудлаа чимээгүй даадаг. Гэхдээ дохиог нь эрт танивал хүндрэлээс сэргийлж болно.`;
  const problem = `${profile.mnName} дээр үүссэн өөрчлөлт эхэндээ зовиур багатай тул хүмүүс хойшлуулдаг.`;
  const cause = `Ихэвчлэн ${profile.cause} зэрэг хүчин зүйлс ачааллыг нэмэгдүүлдэг.`;
  const solution = `Харин ${profile.solution} бол эрсдэлийг бууруулах хамгийн зөв алхам.`;
  const cta = `${profile.mnName}-ээ хамгаалахын тулд өнөөдөр үзлэгээ товлоорой.`;

  return {
    mode: "explainer",
    topic: profile.mnName,
    title: `${profile.mnName} тайлбар reel`,
    hook,
    problem,
    cause,
    solution,
    cta,
    fullText: [hook, problem, cause, solution, cta].join(" "),
    segments: [
      {
        index: 1,
        title: `${profile.mnName} яагаад чухал вэ?`,
        narration: `${hook} ${problem}`,
        imagePrompt: `High detail medical illustration of the human ${profile.enName}, cinematic lighting, realistic educational style, clean hospital visual, vertical composition`,
        videoPrompt: `A realistic cinematic medical scene focused on the human ${profile.enName}, subtle camera motion, clinical lighting, educational healthcare commercial, vertical 9:16`,
      },
      {
        index: 2,
        title: "Шалтгаан ба эрсдэл",
        narration: `${cause} Үүний дараа ${profile.warning} илэрч болно.`,
        imagePrompt: `Medical visualization of ${profile.enName} stress and risk factors, dynamic infographic feeling, realistic anatomy, healthcare awareness style`,
        videoPrompt: `A dramatic educational healthcare shot showing stress on the ${profile.enName}, realistic anatomy, floating particles, cinematic motion, vertical social reel`,
      },
      {
        index: 3,
        title: "Шийдэл ба уриалга",
        narration: `${solution} ${cta}`,
        imagePrompt: `Hopeful healthcare illustration showing ${profile.enName} recovery, physician guidance, clean premium medical campaign look`,
        videoPrompt: `A hopeful medical recovery scene centered on the ${profile.enName}, doctor-guided wellness, premium healthcare campaign, smooth camera move, vertical 9:16`,
      },
    ],
  };
}

export async function buildOrganTalkScript(topic: string): Promise<GeneratedScript> {
  const profile = getProfile(topic);

  try {
    const generated = await generateScriptWithOpenAi({
      mode: "organ_talk",
      topic: profile.mnName,
      segmentCount: 5,
    });

    if (generated) {
      return {
        mode: "organ_talk",
        topic: generated.topic,
        title: generated.title,
        hook: generated.hook,
        problem: generated.problem,
        cause: generated.cause,
        solution: generated.solution,
        cta: generated.cta,
        fullText: [
          generated.hook,
          generated.problem,
          generated.cause,
          generated.solution,
          generated.cta,
        ].join(" "),
        segments: generated.segments,
      };
    }
  } catch (error) {
    console.error("OpenAI organ-talk script generation failed, falling back.", error);
  }

  const hook = `Сайн байна уу, би бол ${profile.mnName} байна. Намайг өвдөхөөс өмнө сонсож сурвал би чамд удаан үйлчилнэ.`;
  const problem = `Би өдөр бүр таны биеийг дэмждэг ч ${profile.cause} намайг ачааллуулж эхэлдэг.`;
  const cause = `Тэгэхээр ${profile.warning} бол миний “надад туслаач” гэсэн дохио шүү.`;
  const solution = `Надад амралт хэрэгтэй: ${profile.solution}.`;
  const cta = `Хэрэв намайг үл тоовол ${profile.consequence} рүү явж магадгүй. Одоо үзлэгт хамрагдаарай.`;

  return {
    mode: "organ_talk",
    topic: profile.mnName,
    title: `${profile.mnName} өөрөө ярьж байна`,
    hook,
    problem,
    cause,
    solution,
    cta,
    fullText: [hook, problem, cause, solution, cta].join(" "),
    segments: [
      {
        index: 1,
        title: "Би хэн бэ?",
        narration: hook,
        imagePrompt: `Expressive medical portrait of a human ${profile.enName} as a speaking character, realistic anatomy, warm cinematic lighting, educational social media poster`,
        videoPrompt: `A cinematic character shot of a human ${profile.enName} speaking directly to the viewer, realistic anatomy with personality, healthcare education reel, vertical 9:16`,
      },
      {
        index: 2,
        title: "Миний гомдол",
        narration: problem,
        imagePrompt: `Detailed medical visualization of a stressed ${profile.enName}, emotional educational style, realistic anatomy, cinematic glow`,
        videoPrompt: `A dramatic medical clip showing a stressed human ${profile.enName}, subtle emotional movement, educational healthcare mood, vertical social video`,
      },
      {
        index: 3,
        title: "Миний анхааруулга",
        narration: cause,
        imagePrompt: `Warning-focused healthcare illustration of ${profile.enName} symptoms and risk signals, premium medical campaign art direction`,
        videoPrompt: `A warning-focused healthcare video about the human ${profile.enName}, realistic symptoms, cinematic medical storytelling, vertical 9:16`,
      },
      {
        index: 4,
        title: "Надад хэрэгтэй зүйл",
        narration: solution,
        imagePrompt: `Supportive physician-guided treatment scene for ${profile.enName}, realistic medical care, hopeful visual tone`,
        videoPrompt: `A hopeful physician-guided medical scene helping the human ${profile.enName}, realistic clinic environment, reassuring cinematic style, vertical 9:16`,
      },
      {
        index: 5,
        title: "Одоо арга хэмжээ ав",
        narration: cta,
        imagePrompt: `Emotional healthcare call-to-action visual centered on protecting the ${profile.enName}, premium hospital campaign, realistic lighting`,
        videoPrompt: `A persuasive healthcare call-to-action clip about protecting the human ${profile.enName}, emotional but trustworthy medical campaign, vertical 9:16`,
      },
    ],
  };
}

export async function buildDoctorVisualPlan(topic: string, specialty?: string): Promise<DoctorVisualPlan> {
  const profile = getProfile(topic || specialty || "эрүүл мэнд");
  const contextualTopic = topic || specialty || profile.mnName;

  try {
    const generated = await generateDoctorPlanWithOpenAi({
      topic: contextualTopic,
      specialty,
    });

    if (generated) {
      return generated;
    }
  } catch (error) {
    console.error("OpenAI doctor visual plan generation failed, falling back.", error);
  }

  return {
    topic: contextualTopic,
    captions: [
      `${contextualTopic} - эрсдэл`,
      `${contextualTopic} - шинж тэмдэг`,
      `${contextualTopic} - шалтгаан`,
      `${contextualTopic} - шийдэл`,
    ],
    imagePrompts: [
      `High detail medical illustration of ${profile.enName} risk factors, premium healthcare explainer style, cinematic lighting, vertical 9:16 framing`,
      `Realistic healthcare visual showing warning signs related to the ${profile.enName}, educational social media design, clean clinical composition`,
      `Cinematic medical illustration of the causes affecting the human ${profile.enName}, realistic anatomy, informative and dramatic`,
      `Hopeful medical campaign visual showing physician-guided recovery for the ${profile.enName}, premium healthcare branding`,
    ],
  };
}
