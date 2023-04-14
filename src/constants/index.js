import {
    mobile,
    backend,
    creator,
    web,
    javascript,
    typescript,
    html,
    css,
    reactjs,
    redux,
    tailwind,
    nodejs,
    mongodb,
    git,
    figma,
    docker,
    carrent,
    jobit,
    tripguide,
    threejs,
  } from "../assets";
  
  export const navLinks = [
    {
      id: "about",
      title: "About",
    },
    {
      id: "projects",
      title: "Projects",
    },
    {
      id: "contact",
      title: "Contact",
    },
  ];
  
  const services = [
    {
      title: "Web Developer",
      icon: web,
    },
    {
      title: "AI Integrations",
      icon: mobile,
    },
    {
      title: "Python Data Visualization",
      icon: backend,
    },
    {
      title: "Three.js and WebGL",
      icon: creator,
    },
  ];
  
  const technologies = [
    {
      name: "HTML 5",
      icon: html,
    },
    {
      name: "CSS 3",
      icon: css,
    },
    {
      name: "JavaScript",
      icon: javascript,
    },
    {
      name: "TypeScript",
      icon: typescript,
    },
    {
      name: "React JS",
      icon: reactjs,
    },
    // {
    //   name: "Redux Toolkit",
    //   icon: redux,
    // },
    {
      name: "Tailwind CSS",
      icon: tailwind,
    },
    {
      name: "Node JS",
      icon: nodejs,
    },
    // {
    //   name: "MongoDB",
    //   icon: mongodb,
    // },
    {
      name: "Three JS",
      icon: threejs,
    },
    {
      name: "git",
      icon: git,
    },
    // {
    //   name: "figma",
    //   icon: figma,
    // },
    {
      name: "docker",
      icon: docker,
    },
  ];
  
  const projects = [
    {
      name: "Respiratory Diseases Classification",
      description:
        "Trained a CNN model with TensorFlow 2.11 to classify respiratory diseases by WAV recordings.",
      tags: [
        {
          name: "TensorFlow",
          color: "blue-text-gradient",
        },
        {
          name: "StreamLit",
          color: "green-text-gradient",
        },
        {
          name: "Colaboratory",
          color: "pink-text-gradient",
        },
      ],
      image: tripguide,
      source_code_link: "https://pernapasan.streamlit.app",
    },
  ];
  
  export { services, technologies, projects };