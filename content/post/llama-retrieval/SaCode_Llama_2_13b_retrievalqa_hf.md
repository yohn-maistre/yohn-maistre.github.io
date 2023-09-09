---
title: Using Llama 2-13b for RetrievalQA with LangChain and HuggingFace
subtitle: In recent times, AI has been increasingly democratized. Now we can use a state-of-the-art Large Language Model in a single T4 GPU instance to read documents (or any file) for us. Here's how.
summary: In recent times, AI has been increasingly democratized. Now we can use a state-of-the-art Large Language Model in a single T4 GPU instance to read documents (or any file) for us. Here's how.
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

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/pinecone-io/examples/blob/master/learn/generation/llm-field-guide/llama-2/llama-2-13b-retrievalqa.ipynb) [![Open nbviewer](https://raw.githubusercontent.com/pinecone-io/examples/master/assets/nbviewer-shield.svg)](https://nbviewer.org/github/pinecone-io/examples/blob/master/learn/generation/llm-field-guide/llama-2/llama-2-13b-retrievalqa.ipynb)

# RAG with LLaMa 13B

In this notebook we'll explore how we can use the open source **Llama-13b-chat** model in both Hugging Face transformers and LangChain.
At the time of writing, you must first request access to Llama 2 models via [this form](https://ai.meta.com/resources/models-and-libraries/llama-downloads/) (access is typically granted within a few hours). If you need guidance on getting access please refer to the beginning of this [article](https://www.pinecone.io/learn/llama-2/) or [video](https://youtu.be/6iHVJyX2e50?t=175).

---

🚨 _Note that running this on CPU is sloooow. If running on Google Colab you can avoid this by going to **Runtime > Change runtime type > Hardware accelerator > GPU > GPU type > T4**. This should be included within the free tier of Colab._

---

We start by doing a `pip install` of all required libraries.


```python
!pip install -qU \
  transformers==4.31.0 \
  sentence-transformers==2.2.2 \
  pinecone-client==2.2.2 \
  datasets==2.14.0 \
  accelerate==0.21.0 \
  einops==0.6.1 \
  langchain==0.0.240 \
  xformers==0.0.20 \
  bitsandbytes==0.41.0
```


    ---------------------------------------------------------------------------

    NotImplementedError                       Traceback (most recent call last)

    <ipython-input-28-7814daf2c61a> in <cell line: 1>()
    ----> 1 get_ipython().system('pip install -qU    transformers==4.31.0    sentence-transformers==2.2.2    pinecone-client==2.2.2    datasets==2.14.0    accelerate==0.21.0    einops==0.6.1    langchain==0.0.240    xformers==0.0.20    bitsandbytes==0.41.0')
    

    /usr/local/lib/python3.10/dist-packages/google/colab/_shell.py in system(self, *args, **kwargs)
         97       kwargs.update({'also_return_output': True})
         98 
    ---> 99     output = _system_commands._system_compat(self, *args, **kwargs)  # pylint:disable=protected-access
        100 
        101     if pip_warn:
    

    /usr/local/lib/python3.10/dist-packages/google/colab/_system_commands.py in _system_compat(shell, cmd, also_return_output)
        451   # is expected to call this function, thus adding one level of nesting to the
        452   # stack.
    --> 453   result = _run_command(
        454       shell.var_expand(cmd, depth=2), clear_streamed_output=False
        455   )
    

    /usr/local/lib/python3.10/dist-packages/google/colab/_system_commands.py in _run_command(cmd, clear_streamed_output)
        165   locale_encoding = locale.getpreferredencoding()
        166   if locale_encoding != _ENCODING:
    --> 167     raise NotImplementedError(
        168         'A UTF-8 locale is required. Got {}'.format(locale_encoding)
        169     )
    

    NotImplementedError: A UTF-8 locale is required. Got ANSI_X3.4-1968


## Initializing the Hugging Face Embedding Pipeline

We begin by initializing the embedding pipeline that will handle the transformation of our docs into vector embeddings. We will use the `sentence-transformers/all-MiniLM-L6-v2` model for embedding.


```python
from torch import cuda
from langchain.embeddings.huggingface import HuggingFaceEmbeddings

embed_model_id = 'sentence-transformers/all-MiniLM-L6-v2'

device = f'cuda:{cuda.current_device()}' if cuda.is_available() else 'cpu'

embed_model = HuggingFaceEmbeddings(
    model_name=embed_model_id,
    model_kwargs={'device': device},
    encode_kwargs={'device': device, 'batch_size': 32}
)
```

We can use the embedding model to create document embeddings like so:


```python
docs = [
    "this is one document",
    "and another document"
]

embeddings = embed_model.embed_documents(docs)

print(f"Kita punya {len(embeddings)} doc yang sudah di-embed, masing-masing dengan "
      f"dimensi {len(embeddings[0])}.")
```

    Kita punya 2 doc yang sudah di-embed, masing-masing dengan dimensi 384.
    

## Bangun Indeks Vektor

Sekarang kita perlu menggunakan pipeline embedding untuk membangun embedding kita dan menyimpannya di indeks vektor Pinecone. Untuk memulai, kita akan menginisialisasi indeks kita, untuk ini kita akan membutuhkan [kunci API Pinecone gratis](https://app.pinecone.io/).


```python
import os
import pinecone

# get API key from app.pinecone.io and environment from console
pinecone.init(
    api_key=os.environ.get('PINECONE_API_KEY') or 'd13041cb-813a-43f3-921e-abbb00f4c47c',
    environment=os.environ.get('PINECONE_ENVIRONMENT') or 'us-west1-gcp'
)
```

Inisialisasi indeks


```python
import time

index_name = 'llama-2-rag'

if index_name not in pinecone.list_indexes():
    pinecone.create_index(
        index_name,
        dimension=len(embeddings[0]),
        metric='cosine'
    )
    # wait for index to finish initialization
    while not pinecone.describe_index(index_name).status['ready']:
        time.sleep(1)
```

Now we connect to the index:


```python
index = pinecone.Index(index_name)
index.describe_index_stats()
```




    {'dimension': 384,
     'index_fullness': 0.0,
     'namespaces': {'': {'vector_count': 4838}},
     'total_vector_count': 4838}



With our index and embedding process ready we can move onto the indexing process itself. For that, we'll need a dataset. We will use a set of Arxiv papers related to (and including) the Llama 2 research paper.


```python
from datasets import load_dataset

data = load_dataset(
    'jamescalam/llama-2-arxiv-papers-chunked',
    split='train'
)
data
```


    Downloading readme:   0%|          | 0.00/409 [00:00<?, ?B/s]



    Downloading data files:   0%|          | 0/1 [00:00<?, ?it/s]



    Downloading data:   0%|          | 0.00/14.4M [00:00<?, ?B/s]



    Extracting data files:   0%|          | 0/1 [00:00<?, ?it/s]



    Generating train split: 0 examples [00:00, ? examples/s]





    Dataset({
        features: ['doi', 'chunk-id', 'chunk', 'id', 'title', 'summary', 'source', 'authors', 'categories', 'comment', 'journal_ref', 'primary_category', 'published', 'updated', 'references'],
        num_rows: 4838
    })



We will embed and index the documents like so:


```python
data = data.to_pandas()

batch_size = 32

for i in range(0, len(data), batch_size):
    i_end = min(len(data), i+batch_size)
    batch = data.iloc[i:i_end]
    ids = [f"{x['doi']}-{x['chunk-id']}" for i, x in batch.iterrows()]
    texts = [x['chunk'] for i, x in batch.iterrows()]
    embeds = embed_model.embed_documents(texts)
    # get metadata to store in Pinecone
    metadata = [
        {'text': x['chunk'],
         'source': x['source'],
         'title': x['title']} for i, x in batch.iterrows()
    ]
    # add to Pinecone
    index.upsert(vectors=zip(ids, embeds, metadata))
```


```python
index.describe_index_stats()
```




    {'dimension': 384,
     'index_fullness': 0.0,
     'namespaces': {'': {'vector_count': 4838}},
     'total_vector_count': 4838}



## Initializing the Hugging Face Pipeline

The first thing we need to do is initialize a `text-generation` pipeline with Hugging Face transformers. The Pipeline requires three things that we must initialize first, those are:

* A LLM, in this case it will be `meta-llama/Llama-2-13b-chat-hf`.

* The respective tokenizer for the model.

We'll explain these as we get to them, let's begin with our model.

We initialize the model and move it to our CUDA-enabled GPU. Using Colab this can take 5-10 minutes to download and initialize the model.


```python
from torch import cuda, bfloat16
import transformers

model_id = 'tiiuae/falcon-7b-instruct'

device = f'cuda:{cuda.current_device()}' # if cuda.is_available() else 'cpu'

# set quantization configuration to load large model with less GPU memory
# this requires the `bitsandbytes` library
bnb_config = transformers.BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type='nf4',
    bnb_4bit_use_double_quant=True,
    bnb_4bit_compute_dtype=bfloat16
)

# begin initializing HF items, need auth token for these
hf_auth = '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'
model_config = transformers.AutoConfig.from_pretrained(
    model_id,
    use_auth_token=hf_auth
)

model = transformers.AutoModelForCausalLM.from_pretrained(
    model_id,
    trust_remote_code=True,
    config=model_config,
    quantization_config=bnb_config,
    device_map='auto',
    use_auth_token=hf_auth
)
model.eval()
print(f"Model loaded on {device}")
```

    Loading tiiuae/falcon-7b-instruct requires to execute some code in that repo, you can inspect the content of the repository at https://hf.co/tiiuae/falcon-7b-instruct. You can dismiss this prompt by passing `trust_remote_code=True`.
    Do you accept? [y/N] y
    

    /usr/local/lib/python3.10/dist-packages/transformers/configuration_utils.py:483: FutureWarning: The `use_auth_token` argument is deprecated and will be removed in v5 of Transformers.
      warnings.warn(
    /usr/local/lib/python3.10/dist-packages/transformers/modeling_utils.py:2193: FutureWarning: The `use_auth_token` argument is deprecated and will be removed in v5 of Transformers.
      warnings.warn(
    


    Loading checkpoint shards:   0%|          | 0/2 [00:00<?, ?it/s]



    Downloading (…)neration_config.json:   0%|          | 0.00/111 [00:00<?, ?B/s]


    Model loaded on cuda:0
    

The pipeline requires a tokenizer which handles the translation of human readable plaintext to LLM readable token IDs. The Llama 2 13B models were trained using the Llama 2 13B tokenizer, which we initialize like so:


```python
tokenizer = transformers.AutoTokenizer.from_pretrained(
    model_id,
    use_auth_token=hf_auth
)
```


    Downloading (…)okenizer_config.json:   0%|          | 0.00/220 [00:00<?, ?B/s]


    /usr/local/lib/python3.10/dist-packages/transformers/tokenization_utils_base.py:1714: FutureWarning: The `use_auth_token` argument is deprecated and will be removed in v5 of Transformers.
      warnings.warn(
    


    Downloading (…)/main/tokenizer.json:   0%|          | 0.00/2.73M [00:00<?, ?B/s]



    Downloading (…)cial_tokens_map.json:   0%|          | 0.00/281 [00:00<?, ?B/s]


Now we're ready to initialize the HF pipeline. There are a few additional parameters that we must define here. Comments explaining these have been included in the code.


```python
generate_text = transformers.pipeline(
    model=model, tokenizer=tokenizer,
    return_full_text=True,  # langchain expects the full text
    task='text-generation',
    # we pass model parameters here too
    temperature=0.0,  # 'randomness' of outputs, 0.0 is the min and 1.0 the max
    max_new_tokens=512,  # mex number of tokens to generate in the output
    repetition_penalty=1.1  # without this output begins repeating
)
```

Confirm this is working:


```python
res = generate_text("Explain to me the difference between nuclear fission and fusion.")
print(res[0]["generated_text"])
```

    /usr/local/lib/python3.10/dist-packages/transformers/generation/utils.py:1270: UserWarning: You have modified the pretrained model configuration to control generation. This is a deprecated strategy to control generation and will be removed soon, in a future version. Please use a generation configuration file (see https://huggingface.co/docs/transformers/main_classes/text_generation )
      warnings.warn(
    Setting `pad_token_id` to `eos_token_id`:11 for open-end generation.
    

    Explain to me the difference between nuclear fission and fusion.
    Nuclear fission is a nuclear reaction in which an atomic nucleus splits into two smaller nuclei, releasing a large amount of energy in the form of radiation and kinetic energy. Fusion, on the other hand, is a nuclear reaction in which two atomic nuclei combine to form a heavier nucleus, releasing a large amount of energy in the form of radiation and kinetic energy. The main difference between the two reactions is that fusion requires a higher temperature and density of fuel than fission, in order to initiate the reaction, whereas fission can occur at relatively low temperatures and densities.
    

Now to implement this in LangChain


```python
from langchain.llms import HuggingFacePipeline

llm = HuggingFacePipeline(pipeline=generate_text)
```


```python
llm(prompt="Explain to me the difference between nuclear fission and fusion.")
```

    Setting `pad_token_id` to `eos_token_id`:11 for open-end generation.
    




    '\nNuclear fission is a nuclear reaction in which an atomic nucleus splits into two smaller nuclei, releasing a large amount of energy in the form of radiation and kinetic energy. Fusion, on the other hand, is a nuclear reaction in which two atomic nuclei combine to form a heavier nucleus, releasing a large amount of energy in the form of radiation and kinetic energy. The main difference between the two reactions is that fusion requires a higher temperature and density of fuel than fission, in order to initiate the reaction, whereas fission can occur at relatively low temperatures and densities.'



We still get the same output as we're not really doing anything differently here, but we have now added **Llama 2 13B Chat** to the LangChain library. Using this we can now begin using LangChain's advanced agent tooling, chains, etc, with **Llama 2**.

## Initializing a RetrievalQA Chain

For **R**etrieval **A**ugmented **G**eneration (RAG) in LangChain we need to initialize either a `RetrievalQA` or `RetrievalQAWithSourcesChain` object. For both of these we need an `llm` (which we have initialized) and a Pinecone index — but initialized within a LangChain vector store object.

Let's begin by initializing the LangChain vector store, we do it like so:


```python
from langchain.vectorstores import Pinecone

text_field = 'text'  # field in metadata that contains text content

vectorstore = Pinecone(
    index, embed_model.embed_query, text_field
)
```

We can confirm this works like so:


```python
query = 'what makes llama 2 special?'

vectorstore.similarity_search(
    query,  # the search query
    k=3  # returns top 3 most relevant chunks of text
)
```




    [Document(page_content='Ricardo Lopez-Barquilla, Marc Shedroﬀ, Kelly Michelena, Allie Feinstein, Amit Sangani, Geeta\nChauhan,ChesterHu,CharltonGholson,AnjaKomlenovic,EissaJamil,BrandonSpence,Azadeh\nYazdan, Elisa Garcia Anzano, and Natascha Parks.\n•ChrisMarra,ChayaNayak,JacquelinePan,GeorgeOrlin,EdwardDowling,EstebanArcaute,Philomena Lobo, Eleonora Presani, and Logan Kerr, who provided helpful product and technical organization support.\n46\n•Armand Joulin, Edouard Grave, Guillaume Lample, and Timothee Lacroix, members of the original\nLlama team who helped get this work started.\n•Drew Hamlin, Chantal Mora, and Aran Mun, who gave us some design input on the ﬁgures in the\npaper.\n•Vijai Mohan for the discussions about RLHF that inspired our Figure 20, and his contribution to the\ninternal demo.\n•Earlyreviewersofthispaper,whohelpedusimproveitsquality,includingMikeLewis,JoellePineau,\nLaurens van der Maaten, Jason Weston, and Omer Levy.', metadata={'source': 'http://arxiv.org/pdf/2307.09288', 'title': 'Llama 2: Open Foundation and Fine-Tuned Chat Models'}),
     Document(page_content='our responsible release strategy can be found in Section 5.3.\nTheremainderofthispaperdescribesourpretrainingmethodology(Section2),ﬁne-tuningmethodology\n(Section 3), approach to model safety (Section 4), key observations and insights (Section 5), relevant related\nwork (Section 6), and conclusions (Section 7).\n‡https://ai.meta.com/resources/models-and-libraries/llama/\n§We are delaying the release of the 34B model due to a lack of time to suﬃciently red team.\n¶https://ai.meta.com/llama\n‖https://github.com/facebookresearch/llama\n4\nFigure 4: Training of L/l.sc/a.sc/m.sc/a.sc /two.taboldstyle-C/h.sc/a.sc/t.sc : This process begins with the pretraining ofL/l.sc/a.sc/m.sc/a.sc /two.taboldstyle using publicly\navailableonlinesources. Followingthis,wecreateaninitialversionof L/l.sc/a.sc/m.sc/a.sc /two.taboldstyle-C/h.sc/a.sc/t.sc throughtheapplication', metadata={'source': 'http://arxiv.org/pdf/2307.09288', 'title': 'Llama 2: Open Foundation and Fine-Tuned Chat Models'}),
     Document(page_content='Evaluation Results\nSee evaluations for pretraining (Section 2); ﬁne-tuning (Section 3); and safety (Section 4).\nEthical Considerations and Limitations (Section 5.2)\nL/l.sc/a.sc/m.sc/a.sc /two.taboldstyle is a new technology that carries risks with use. Testing conducted to date has been in\nEnglish, and has notcovered, nor could it coverall scenarios. For these reasons, aswith all LLMs,\nL/l.sc/a.sc/m.sc/a.sc /two.taboldstyle’s potential outputs cannot be predicted in advance, and the model may in some instances\nproduceinaccurateorobjectionableresponsestouserprompts. Therefore,beforedeployingany\napplications of L/l.sc/a.sc/m.sc/a.sc /two.taboldstyle, developers should perform safety testing and tuning tailored to their\nspeciﬁc applications of the model. Please see the Responsible Use Guide available available at\nhttps://ai.meta.com/llama/responsible-user-guide\nTable 52: Model card for L/l.sc/a.sc/m.sc/a.sc /two.taboldstyle .\n77', metadata={'source': 'http://arxiv.org/pdf/2307.09288', 'title': 'Llama 2: Open Foundation and Fine-Tuned Chat Models'})]



Looks good! Now we can put our `vectorstore` and `llm` together to create our RAG pipeline.


```python
from langchain.chains import RetrievalQA

rag_pipeline = RetrievalQA.from_chain_type(
    llm=llm, chain_type='stuff',
    retriever=vectorstore.as_retriever()
)
```

Let's begin asking questions! First let's try *without* RAG:


```python
llm('what is so special about llama 2?')
```

    Setting `pad_token_id` to `eos_token_id`:11 for open-end generation.
    




    "\nI'm sorry, I cannot provide a response as there is no context or information provided about what llama 2 is."



Hmm, that's not what we meant... What if we use our RAG pipeline?


```python
rag_pipeline('what is so special about llama 2?')
```

    Setting `pad_token_id` to `eos_token_id`:11 for open-end generation.
    




    {'query': 'what is so special about llama 2?',
     'result': '\n\nLlama 2 is a collection of pretrained and fine-tuned large language models (LLMs) ranging in scale from 7 billion to 70 billion parameters. These LLMs are optimized for dialogue use cases and outperform open-source chat models on most benchmarks tested. Additionally, Llama 2 is a product-ready LLM that is suitable for closed-source applications.'}



This looks *much* better! Let's try some more.


```python
llm('what safety measures were used in the development of llama 2?')
```

Okay, it looks like the LLM with no RAG is less than ideal — let's stop embarassing the poor LLM and stick with RAG + LLM. Let's ask the same question to our RAG pipeline.


```python
rag_pipeline('what safety measures were used in the development of llama 2?')
```

    Setting `pad_token_id` to `eos_token_id`:11 for open-end generation.
    


    ---------------------------------------------------------------------------

    KeyboardInterrupt                         Traceback (most recent call last)

    <ipython-input-27-30c863a6097f> in <cell line: 1>()
    ----> 1 rag_pipeline('what safety measures were used in the development of llama 2?')
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        241         except (KeyboardInterrupt, Exception) as e:
        242             run_manager.on_chain_error(e)
    --> 243             raise e
        244         run_manager.on_chain_end(outputs)
        245         final_outputs: Dict[str, Any] = self.prep_outputs(
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        235         try:
        236             outputs = (
    --> 237                 self._call(inputs, run_manager=run_manager)
        238                 if new_arg_supported
        239                 else self._call(inputs)
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/retrieval_qa/base.py in _call(self, inputs, run_manager)
        131         else:
        132             docs = self._get_docs(question)  # type: ignore[call-arg]
    --> 133         answer = self.combine_documents_chain.run(
        134             input_documents=docs, question=question, callbacks=_run_manager.get_child()
        135         )
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in run(self, callbacks, tags, metadata, *args, **kwargs)
        443 
        444         if kwargs and not args:
    --> 445             return self(kwargs, callbacks=callbacks, tags=tags, metadata=metadata)[
        446                 _output_key
        447             ]
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        241         except (KeyboardInterrupt, Exception) as e:
        242             run_manager.on_chain_error(e)
    --> 243             raise e
        244         run_manager.on_chain_end(outputs)
        245         final_outputs: Dict[str, Any] = self.prep_outputs(
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        235         try:
        236             outputs = (
    --> 237                 self._call(inputs, run_manager=run_manager)
        238                 if new_arg_supported
        239                 else self._call(inputs)
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/combine_documents/base.py in _call(self, inputs, run_manager)
        104         # Other keys are assumed to be needed for LLM prediction
        105         other_keys = {k: v for k, v in inputs.items() if k != self.input_key}
    --> 106         output, extra_return_dict = self.combine_docs(
        107             docs, callbacks=_run_manager.get_child(), **other_keys
        108         )
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/combine_documents/stuff.py in combine_docs(self, docs, callbacks, **kwargs)
        163         inputs = self._get_inputs(docs, **kwargs)
        164         # Call predict on the LLM.
    --> 165         return self.llm_chain.predict(callbacks=callbacks, **inputs), {}
        166 
        167     async def acombine_docs(
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/llm.py in predict(self, callbacks, **kwargs)
        250                 completion = llm.predict(adjective="funny")
        251         """
    --> 252         return self(kwargs, callbacks=callbacks)[self.output_key]
        253 
        254     async def apredict(self, callbacks: Callbacks = None, **kwargs: Any) -> str:
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        241         except (KeyboardInterrupt, Exception) as e:
        242             run_manager.on_chain_error(e)
    --> 243             raise e
        244         run_manager.on_chain_end(outputs)
        245         final_outputs: Dict[str, Any] = self.prep_outputs(
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/base.py in __call__(self, inputs, return_only_outputs, callbacks, tags, metadata, include_run_info)
        235         try:
        236             outputs = (
    --> 237                 self._call(inputs, run_manager=run_manager)
        238                 if new_arg_supported
        239                 else self._call(inputs)
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/llm.py in _call(self, inputs, run_manager)
         90         run_manager: Optional[CallbackManagerForChainRun] = None,
         91     ) -> Dict[str, str]:
    ---> 92         response = self.generate([inputs], run_manager=run_manager)
         93         return self.create_outputs(response)[0]
         94 
    

    /usr/local/lib/python3.10/dist-packages/langchain/chains/llm.py in generate(self, input_list, run_manager)
        100         """Generate LLM result from inputs."""
        101         prompts, stop = self.prep_prompts(input_list, run_manager=run_manager)
    --> 102         return self.llm.generate_prompt(
        103             prompts,
        104             stop,
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/base.py in generate_prompt(self, prompts, stop, callbacks, **kwargs)
        186     ) -> LLMResult:
        187         prompt_strings = [p.to_string() for p in prompts]
    --> 188         return self.generate(prompt_strings, stop=stop, callbacks=callbacks, **kwargs)
        189 
        190     async def agenerate_prompt(
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/base.py in generate(self, prompts, stop, callbacks, tags, metadata, **kwargs)
        279                 dumpd(self), prompts, invocation_params=params, options=options
        280             )
    --> 281             output = self._generate_helper(
        282                 prompts, stop, run_managers, bool(new_arg_supported), **kwargs
        283             )
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/base.py in _generate_helper(self, prompts, stop, run_managers, new_arg_supported, **kwargs)
        223             for run_manager in run_managers:
        224                 run_manager.on_llm_error(e)
    --> 225             raise e
        226         flattened_outputs = output.flatten()
        227         for manager, flattened_output in zip(run_managers, flattened_outputs):
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/base.py in _generate_helper(self, prompts, stop, run_managers, new_arg_supported, **kwargs)
        210         try:
        211             output = (
    --> 212                 self._generate(
        213                     prompts,
        214                     stop=stop,
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/base.py in _generate(self, prompts, stop, run_manager, **kwargs)
        602         for prompt in prompts:
        603             text = (
    --> 604                 self._call(prompt, stop=stop, run_manager=run_manager, **kwargs)
        605                 if new_arg_supported
        606                 else self._call(prompt, stop=stop, **kwargs)
    

    /usr/local/lib/python3.10/dist-packages/langchain/llms/huggingface_pipeline.py in _call(self, prompt, stop, run_manager, **kwargs)
        166         **kwargs: Any,
        167     ) -> str:
    --> 168         response = self.pipeline(prompt)
        169         if self.pipeline.task == "text-generation":
        170             # Text generation return includes the starter text.
    

    /usr/local/lib/python3.10/dist-packages/transformers/pipelines/text_generation.py in __call__(self, text_inputs, **kwargs)
        198               ids of the generated text.
        199         """
    --> 200         return super().__call__(text_inputs, **kwargs)
        201 
        202     def preprocess(self, prompt_text, prefix="", handle_long_generation=None, **generate_kwargs):
    

    /usr/local/lib/python3.10/dist-packages/transformers/pipelines/base.py in __call__(self, inputs, num_workers, batch_size, *args, **kwargs)
       1120             )
       1121         else:
    -> 1122             return self.run_single(inputs, preprocess_params, forward_params, postprocess_params)
       1123 
       1124     def run_multi(self, inputs, preprocess_params, forward_params, postprocess_params):
    

    /usr/local/lib/python3.10/dist-packages/transformers/pipelines/base.py in run_single(self, inputs, preprocess_params, forward_params, postprocess_params)
       1127     def run_single(self, inputs, preprocess_params, forward_params, postprocess_params):
       1128         model_inputs = self.preprocess(inputs, **preprocess_params)
    -> 1129         model_outputs = self.forward(model_inputs, **forward_params)
       1130         outputs = self.postprocess(model_outputs, **postprocess_params)
       1131         return outputs
    

    /usr/local/lib/python3.10/dist-packages/transformers/pipelines/base.py in forward(self, model_inputs, **forward_params)
       1026                 with inference_context():
       1027                     model_inputs = self._ensure_tensor_on_device(model_inputs, device=self.device)
    -> 1028                     model_outputs = self._forward(model_inputs, **forward_params)
       1029                     model_outputs = self._ensure_tensor_on_device(model_outputs, device=torch.device("cpu"))
       1030             else:
    

    /usr/local/lib/python3.10/dist-packages/transformers/pipelines/text_generation.py in _forward(self, model_inputs, **generate_kwargs)
        259 
        260         # BS x SL
    --> 261         generated_sequence = self.model.generate(input_ids=input_ids, attention_mask=attention_mask, **generate_kwargs)
        262         out_b = generated_sequence.shape[0]
        263         if self.framework == "pt":
    

    /usr/local/lib/python3.10/dist-packages/torch/utils/_contextlib.py in decorate_context(*args, **kwargs)
        113     def decorate_context(*args, **kwargs):
        114         with ctx_factory():
    --> 115             return func(*args, **kwargs)
        116 
        117     return decorate_context
    

    /usr/local/lib/python3.10/dist-packages/transformers/generation/utils.py in generate(self, inputs, generation_config, logits_processor, stopping_criteria, prefix_allowed_tokens_fn, synced_gpus, assistant_model, streamer, **kwargs)
       1536 
       1537             # 11. run greedy search
    -> 1538             return self.greedy_search(
       1539                 input_ids,
       1540                 logits_processor=logits_processor,
    

    /usr/local/lib/python3.10/dist-packages/transformers/generation/utils.py in greedy_search(self, input_ids, logits_processor, stopping_criteria, max_length, pad_token_id, eos_token_id, output_attentions, output_hidden_states, output_scores, return_dict_in_generate, synced_gpus, streamer, **model_kwargs)
       2360 
       2361             # forward pass to get next token
    -> 2362             outputs = self(
       2363                 **model_inputs,
       2364                 return_dict=True,
    

    /usr/local/lib/python3.10/dist-packages/torch/nn/modules/module.py in _call_impl(self, *args, **kwargs)
       1499                 or _global_backward_pre_hooks or _global_backward_hooks
       1500                 or _global_forward_hooks or _global_forward_pre_hooks):
    -> 1501             return forward_call(*args, **kwargs)
       1502         # Do not call functions when jit is used
       1503         full_backward_hooks, non_full_backward_hooks = [], []
    

    /usr/local/lib/python3.10/dist-packages/accelerate/hooks.py in new_forward(*args, **kwargs)
        163                 output = old_forward(*args, **kwargs)
        164         else:
    --> 165             output = old_forward(*args, **kwargs)
        166         return module._hf_hook.post_forward(module, output)
        167 
    

    ~/.cache/huggingface/modules/transformers_modules/tiiuae/falcon-7b-instruct/eb410fb6ffa9028e97adb801f0d6ec46d02f8b07/modelling_RW.py in forward(self, input_ids, past_key_values, attention_mask, head_mask, inputs_embeds, labels, use_cache, output_attentions, output_hidden_states, return_dict, **deprecated_arguments)
        751         return_dict = return_dict if return_dict is not None else self.config.use_return_dict
        752 
    --> 753         transformer_outputs = self.transformer(
        754             input_ids,
        755             past_key_values=past_key_values,
    

    /usr/local/lib/python3.10/dist-packages/torch/nn/modules/module.py in _call_impl(self, *args, **kwargs)
       1499                 or _global_backward_pre_hooks or _global_backward_hooks
       1500                 or _global_forward_hooks or _global_forward_pre_hooks):
    -> 1501             return forward_call(*args, **kwargs)
       1502         # Do not call functions when jit is used
       1503         full_backward_hooks, non_full_backward_hooks = [], []
    

    /usr/local/lib/python3.10/dist-packages/accelerate/hooks.py in new_forward(*args, **kwargs)
        163                 output = old_forward(*args, **kwargs)
        164         else:
    --> 165             output = old_forward(*args, **kwargs)
        166         return module._hf_hook.post_forward(module, output)
        167 
    

    ~/.cache/huggingface/modules/transformers_modules/tiiuae/falcon-7b-instruct/eb410fb6ffa9028e97adb801f0d6ec46d02f8b07/modelling_RW.py in forward(self, input_ids, past_key_values, attention_mask, head_mask, inputs_embeds, use_cache, output_attentions, output_hidden_states, return_dict, **deprecated_arguments)
        646                 )
        647             else:
    --> 648                 outputs = block(
        649                     hidden_states,
        650                     layer_past=layer_past,
    

    /usr/local/lib/python3.10/dist-packages/torch/nn/modules/module.py in _call_impl(self, *args, **kwargs)
       1499                 or _global_backward_pre_hooks or _global_backward_hooks
       1500                 or _global_forward_hooks or _global_forward_pre_hooks):
    -> 1501             return forward_call(*args, **kwargs)
       1502         # Do not call functions when jit is used
       1503         full_backward_hooks, non_full_backward_hooks = [], []
    

    /usr/local/lib/python3.10/dist-packages/accelerate/hooks.py in new_forward(*args, **kwargs)
        163                 output = old_forward(*args, **kwargs)
        164         else:
    --> 165             output = old_forward(*args, **kwargs)
        166         return module._hf_hook.post_forward(module, output)
        167 
    

    ~/.cache/huggingface/modules/transformers_modules/tiiuae/falcon-7b-instruct/eb410fb6ffa9028e97adb801f0d6ec46d02f8b07/modelling_RW.py in forward(self, hidden_states, alibi, attention_mask, layer_past, head_mask, use_cache, output_attentions)
        383 
        384         # Self attention.
    --> 385         attn_outputs = self.self_attention(
        386             layernorm_output,
        387             layer_past=layer_past,
    

    /usr/local/lib/python3.10/dist-packages/torch/nn/modules/module.py in _call_impl(self, *args, **kwargs)
       1499                 or _global_backward_pre_hooks or _global_backward_hooks
       1500                 or _global_forward_hooks or _global_forward_pre_hooks):
    -> 1501             return forward_call(*args, **kwargs)
       1502         # Do not call functions when jit is used
       1503         full_backward_hooks, non_full_backward_hooks = [], []
    

    /usr/local/lib/python3.10/dist-packages/accelerate/hooks.py in new_forward(*args, **kwargs)
        163                 output = old_forward(*args, **kwargs)
        164         else:
    --> 165             output = old_forward(*args, **kwargs)
        166         return module._hf_hook.post_forward(module, output)
        167 
    

    ~/.cache/huggingface/modules/transformers_modules/tiiuae/falcon-7b-instruct/eb410fb6ffa9028e97adb801f0d6ec46d02f8b07/modelling_RW.py in forward(self, hidden_states, alibi, attention_mask, layer_past, head_mask, use_cache, output_attentions)
        243 
        244         # 3 x [batch_size, seq_length, num_heads, head_dim]
    --> 245         (query_layer, key_layer, value_layer) = self._split_heads(fused_qkv)
        246 
        247         batch_size, q_length, _, _ = query_layer.shape
    

    KeyboardInterrupt: 


A reasonable answer from the RAG pipeline, but it doesn't contain much information — maybe we can ask more about this, like what is this _"red team"_ procedure that delayed the launch of the 34B model?


```python
rag_pipeline('what red teaming procedures were followed for llama 2?')
```

Very interesting!


```python
rag_pipeline('how does the performance of llama 2 compare to other local LLMs?')
```


```python

```
