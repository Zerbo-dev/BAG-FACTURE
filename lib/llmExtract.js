const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu extrais les informations d'un devis ou d'une facture a partir
d'un message libre ecrit par un artisan/technicien en francais (Burkina Faso).

Reponds UNIQUEMENT avec un objet JSON valide, sans aucun texte autour, au format exact:
{
  "docType": "devis" ou "facture" (par defaut "devis" si non precise),
  "client": { "name": string, "address": string ou "", "phone": string ou "" },
  "items": [ { "description": string, "unitPrice": number, "quantity": number ou null } ],
  "tvaRate": number (0 par defaut si non precise),
  "missingFields": [liste des champs importants manquants parmi: "client.name", "items"]
}

Regles:
- Les prix sont en francs CFA, toujours des nombres entiers (pas de texte, pas de symbole).
- Si la quantite n'est pas precisee pour une ligne, mets quantity a null (le prix unitaire sert alors de total pour cette ligne).
- Si le nom du client n'est pas mentionne, mets client.name a "" et ajoute "client.name" a missingFields.
- Si aucune prestation n'est identifiable, items doit etre un tableau vide et missingFields doit contenir "items".
- N'invente jamais de donnees non mentionnees dans le message.`;

async function extractInvoiceData(userText, previousData) {
  const contextNote = previousData
    ? `Voici les donnees deja collectees a completer/corriger: ${JSON.stringify(previousData)}\n\n`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextNote}Message de l'utilisateur:\n"""${userText}"""`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Reponse IA vide");

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

module.exports = { extractInvoiceData };
