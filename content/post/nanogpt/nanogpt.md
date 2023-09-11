---
title: Andrej Karpathy's "GPT from Scratch" Textual Guide - Part 1 
subtitle: AI has been increasingly democratized.
summary: Andrej Karpathy's is a legend. Here he gives a clear and concise lecture on transformers and attention while creating one from scratch. This is just me rewriting what I've learned.
authors:
  - admin
tags: [LangChain, HuggingFace, AI]
categories: 
  - LLM
  - LangChain
  - HuggingFace
  - AI
projects: []
date: '2022-09-24T00:00:00Z'
lastMod: '2022-09-24T00:00:00Z'
image:
  caption: ''
  focal_point: ''
---

If you're interested in delving into the world of creating language models like ChatGPT or crafting your very own GPT model from scratch on your computer, this blog is your go-to guide. 😄

For a visual tutorial, check out this video guide: https://www.youtube.com/watch?v=kCc8FmEb1nY&ab_channel=AndrejKarpathy

And here's the code you'll need: https://colab.research.google.com/drive/1JMLa53HDuA-i7ZBmqV7ZnA3c_fvtXnx-?usp=sharing

Andrej Karpathy did a stellar job breaking down GPT for newcomers and those with some prior knowledge. This blog is Part 1 aiming to simplify the topic just for me to learn.

Let's dive in!

ChatGPT. It takes the words you input and dissects them into a sequence. Then, it uses this sequence to predict the next word or words, making your text sound impressively human-like. ChatGPT is based on the GPT-3 model, which underwent training on a colossal 45 terabytes of text data. If you were thinking about replicating this on your laptop, be prepared for it to take approximately 335 years!

However, there's a glimmer of hope. Recently, Stanford and Databricks introduced Alpaca and Dolly models, hinting at the possibility of creating powerful tools like ChatGPT with significantly fewer resources. Keep an eye out for more details; I'll be sharing them soon.

Now, let's talk Transformers. In 2017, a paper titled "Attention is all you need" was published. At the time, its authors probably didn't foresee the transformative impact of the Transformer architecture on the field.

You might have come across this diagram:

Transformer Diagram

It serves as the basis for GPT and various other AI applications. We'll employ this architecture to construct our personalized GPT.

While the colossal 45 TB of data that GPT-3 trained on is beyond our reach, we're going for something simpler: all the words written by Shakespeare. You can find the data here: Access the Data.

Our objective? Training a Transformer-based language model, but it's going to be character-level. In other words, it will predict the next character in a sequence. In contrast, ChatGPT predicts entire words.

Now, there's something called nanGPT, but we'll save that discussion for later.

Ready for action? First, we'll read and explore the data to determine the number of characters.

Next, we'll delve into tokenization and split our data into training and validation sets. Why? To assess our model's performance without overfitting.

Here's where it gets intriguing. We can't feed the Transformer with all our training data in one go; that would lead to memory issues. Even though we're working with a small dataset, this chunking approach is essential to prevent memory errors.

We'll also touch upon batch size, a familiar concept in machine learning that facilitates parallel processing. Think of it as serving data in manageable chunks to our Transformer.

Moving on, we'll construct a basic bigram language model as a modest start to language modeling. It's nothing fancy at this stage.

Calculating loss is crucial to gauge our model's performance. We're using negative log likelihood loss here.

Now, the exciting part! We'll generate some text from our model. Brace yourself; it might appear a bit nonsensical at this stage. 🙃

Remember, our model currently relies only on the previous character to predict the next one. We're not considering the full context just yet.

Lastly, we'll train our bigram model to reduce the loss value and enhance predictions. We're employing the Adam optimizer, a well-regarded choice. By increasing our batch size, we'll observe a drop in loss. Repeating this training loop several times can further minimize it.

Now, let's assess whether our predictions have improved by generating text once again. It should look somewhat more sensible, though still far from perfection.

And that wraps up Part 1! Stay tuned for more adventures in constructing language models. 😎🤖