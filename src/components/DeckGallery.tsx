"use client";



import { useMemo, useState } from "react";

import { motion } from "framer-motion";

import { ArrowLeft, Layers } from "lucide-react";

import type { DeckSystem } from "@/lib/decks/types";

import { listDeckCards, DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";

import DeckGalleryFace from "@/components/DeckGalleryFace";

import CardDetailModal from "@/components/CardDetailModal";

import MasterAvatar from "@/components/MasterAvatar";



interface DeckGalleryProps {

  system: DeckSystem;

  masterName: string;

  masterId?: string;

  onBack?: () => void;

  backLabel?: string;

}



export default function DeckGallery({

  system,

  masterName,

  masterId,

  onBack,

  backLabel = "К моему раскладу",

}: DeckGalleryProps) {

  const allCards = useMemo(() => listDeckCards(system), [system]);

  const [modalIndex, setModalIndex] = useState<number | null>(null);



  const systemLabel = DECK_SYSTEM_LABEL[system];



  return (

    <motion.section

      id="колода"

      className="deck-gallery mx-auto mb-12 max-w-6xl px-2 sm:px-4"

      initial={{ opacity: 0, y: 12 }}

      animate={{ opacity: 1, y: 0 }}

      transition={{ duration: 0.4 }}

    >

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">

        <div className="flex items-start gap-4">

          {masterId ? (

            <MasterAvatar masterId={masterId} masterName={masterName} size="lg" />

          ) : null}

          <div>

            <p className="lux-label flex items-center gap-2">

              <Layers className="h-3.5 w-3.5" />

              Колода · {allCards.length} {systemLabel}

            </p>

            <h2 className="font-display text-xl font-semibold text-aura-ivory sm:text-2xl">

              Вся колода {masterName}

            </h2>

            <p className="mt-1 text-xs text-aura-ivory/45">

              Просмотр колоды не расходует дневной расклад

            </p>

          </div>

        </div>

        {onBack && (

          <button

            type="button"

            onClick={onBack}

            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs text-aura-ivory/60 transition-colors hover:border-aura-gold/30 hover:text-aura-champagne"

          >

            <ArrowLeft className="h-3.5 w-3.5" />

            {backLabel}

          </button>

        )}

      </div>



      <div className="deck-gallery__grid">

        {allCards.map((resolved, i) => (

          <DeckGalleryFace

            key={`${resolved.name}-${i}`}

            name={resolved.name}

            imagePath={resolved.imagePath}

            onClick={() => setModalIndex(i)}

          />

        ))}

      </div>



      <CardDetailModal

        open={modalIndex !== null}

        cards={allCards}

        index={modalIndex ?? 0}

        onIndexChange={setModalIndex}

        onClose={() => setModalIndex(null)}

      />

    </motion.section>

  );

}

