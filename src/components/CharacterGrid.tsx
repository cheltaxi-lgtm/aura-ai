"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CHARACTERS } from "@/lib/characters";

interface CharacterGridProps {
  onSelect: (characterId: string) => void;
  recommendedId?: string;
}

export default function CharacterGrid({ onSelect, recommendedId }: CharacterGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {CHARACTERS.map((character, index) => (
        <motion.article
          key={character.id}
          className={`group relative overflow-hidden rounded-2xl border ${character.borderColor} bg-gradient-to-br ${character.gradient} p-6 transition-all duration-500 hover:shadow-neon ${
            recommendedId === character.id ? "ring-2 ring-aura-gold/50" : ""
          }`}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
          whileHover={{ scale: 1.02, y: -4 }}
          style={{ boxShadow: "none" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 0 30px ${character.glowColor}, 0 0 80px ${character.glowColor}`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5 blur-2xl transition-all group-hover:bg-white/10" />

          {recommendedId === character.id && (
            <span className="absolute right-4 top-4 z-10 rounded-full border border-aura-gold/40 bg-aura-gold/15 px-2.5 py-1 text-[10px] font-medium text-aura-gold">
              Подходит вам
            </span>
          )}

          <div className="relative z-10">
            <div className="mb-4 flex items-start justify-between">
              <span className="text-4xl">{character.emoji}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-400">
                {character.style}
              </span>
            </div>

            <h3 className="font-display mb-1 text-2xl font-bold text-white">{character.name}</h3>
            <p className="mb-1 text-sm text-aura-purple/80">{character.title}</p>
            <p className="mb-3 text-sm text-gray-400">{character.specialty}</p>

            <div className="mb-5 flex items-center justify-end text-xs text-gray-500">
              <span className="font-medium text-gray-300">от {character.priceFrom}</span>
            </div>

            <button
              onClick={() => onSelect(character.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-medium text-white transition-all duration-300 hover:border-white/40 hover:bg-white/10"
            >
              Получить расшифровку
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
