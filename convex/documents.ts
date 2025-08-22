import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

const createDocument = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const document = await ctx.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId,
      isArchived: false,
      isPublished: false,
    });

    return document;
  },
});

const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user_parent", (q) =>
        q.eq("userId", userId).eq("parentDocument", args.parentDocument),
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

const archieve = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new Error("Document not found!");
    }

    if (document.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const archieveChildrens = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId),
        )
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: true,
        });

        await archieveChildrens(child._id); //recursively archieve children documents of current document
      }
    };

    const updatedDocument = await ctx.db.patch(args.id, {
      isArchived: true,
    });

    archieveChildrens(args.id); //attempt to archive its children documents if they exist

    return updatedDocument;
  },
});

const getTrashedDocuments = query({
  handler: async (ctx) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    return documents;
  },
});

const restoreDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new Error("Document not found!");
    }

    if (document.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_user_parent", (q) =>
          q.eq("userId", userId).eq("parentDocument", documentId),
        )
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: false,
        });

        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = {
      isArchived: false,
    };

    if (document.parentDocument) {
      const parent = await ctx.db.get(document.parentDocument);
      if (parent?.isArchived) {
        options.parentDocument = undefined;
      }
    }

    const updatedDocument = await ctx.db.patch(args.id, options);
    recursiveRestore(args.id); //recursively restore parent documents
    return updatedDocument;
  },
});

const removeDocument = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;
    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Document not found!");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const document = await ctx.db.delete(args.id);

    return document;
  },
});

const searchDocuments = query({
  handler: async (ctx) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

const getDocumentById = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();

    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Document not found!");

    if (document.isPublished && !document.isArchived) {
      return document;
    }

    const userId = userIdentity?.subject;
    if (document.userId !== userId) {
      throw new Error("Unauthorized access!");
    }

    return document;
  },
});

const updateDocument = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userIdentity = await ctx.auth.getUserIdentity();
    if (!userIdentity) {
      throw new Error("You must be authenticated!");
    }

    const userId = userIdentity.subject;

    const { id, ...rest } = args; //since we don't have to update the id of document

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new Error("Document not found!");
    }

    if (document.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const updatedDocument = await ctx.db.patch(args.id, {
      ...rest,
    });

    return updatedDocument;
  },
});

const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be authenticated!");
    }

    const userId = identity.subject;

    const existingDocument = await ctx.db.get(args.id);
    if (!existingDocument) {
      throw new Error("Document not found!");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const document = await ctx.db.patch(args.id, {
      icon: undefined,
    });

    return document;
  },
});

const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("You must be authenticated!");
    }

    const userId = identity.subject;

    const existingDocument = await ctx.db.get(args.id);
    if (!existingDocument) {
      throw new Error("Document not found!");
    }

    if (existingDocument.userId !== userId) {
      throw new Error("Action not allowed!");
    }

    const document = await ctx.db.patch(args.id, {
      coverImage: undefined,
    });

    return document;
  },
});

export {
  createDocument,
  getSidebar,
  archieve,
  getTrashedDocuments,
  restoreDocument,
  removeDocument,
  searchDocuments,
  getDocumentById,
  updateDocument,
  removeIcon,
  removeCoverImage,
};
