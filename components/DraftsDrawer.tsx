'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type { Poem } from '@/lib/models';
import { poemService } from '@/lib/services';

interface DraftsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPoem: (poem: Poem) => void;
}

export function DraftsDrawer({ isOpen, onClose, onLoadPoem }: DraftsDrawerProps) {
  const [drafts, setDrafts] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const list = await poemService.listPoems();
      setDrafts(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchDrafts();
    }
  }, [isOpen, fetchDrafts]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this saved draft?')) {
      await poemService.deletePoem(id);
      await fetchDrafts();
    }
  };

  const handleSelect = (poem: Poem) => {
    onLoadPoem(poem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div className="bg-[#FAF6EE] border-l border-[#E0D4BE] w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between text-[#24231F] animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between border-b border-[#E0D4BE] pb-4 mb-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#6C3438] font-bold">
                My Collection
              </span>
              <h2 className="text-xl font-serif font-bold text-[#24231F] mt-0.5">
                Saved Poems & Drafts
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-[#8B867C] hover:text-[#24231F] text-xl font-bold p-1"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-[#57544E] mb-4">
            Select a draft to resume editing on the book page:
          </p>
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
          {loading ? (
            <div className="text-center py-12 text-xs text-[#8B867C]">
              Loading your collection...
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-16 px-4 bg-[#F3EBDD]/60 rounded-lg border border-[#E0D4BE]/60 text-xs text-[#8B867C]">
              <p className="font-serif text-base text-[#24231F] mb-1">No drafts yet</p>
              <p>Save your work from the Studio to build your personal erasure anthology.</p>
            </div>
          ) : (
            drafts.map(poem => {
              const formattedDate = new Date(poem.updatedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={poem.id}
                  onClick={() => handleSelect(poem)}
                  className="bg-[#F3EBDD] hover:bg-[#E4D8C2]/80 border border-[#E0D4BE] rounded-lg p-4 cursor-pointer transition-all shadow-sm hover:shadow group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-serif font-semibold text-sm text-[#24231F] group-hover:text-[#6C3438] transition-colors">
                      {poem.title || 'Untitled Poem'}
                    </h3>
                    <button
                      onClick={e => handleDelete(poem.id, e)}
                      title="Delete draft"
                      className="text-xs text-[#8B867C] hover:text-red-700 p-1 opacity-60 group-hover:opacity-100 transition-opacity"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="text-[11px] text-[#57544E] mb-3">
                    Passage: <span className="font-medium text-[#24231F]">{poem.passageId}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#E0D4BE]/60">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#E4D8C2] px-2 py-0.5 rounded text-[#24231F] font-medium uppercase text-[9px] tracking-wider">
                        {poem.erasureStyle}
                      </span>
                      <span className="text-[#57544E]">
                        {poem.retainedTokenIds.length} words
                      </span>
                    </div>
                    <span className="text-[#8B867C] text-[10px]">{formattedDate}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#E0D4BE] text-center">
          <button
            onClick={onClose}
            className="w-full py-2 bg-[#E4D8C2] hover:bg-[#D8CBB2] text-[#24231F] rounded text-xs font-medium transition-colors"
          >
            Close Collection
          </button>
        </div>
      </div>
    </div>
  );
}
