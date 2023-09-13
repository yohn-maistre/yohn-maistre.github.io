---
# Leave the homepage title empty to use the site title
title: Portfolio
date: 2023-09-04
type: landing

sections:
  - block: hero
    content:
      title: "Hi, halo 👋🏽"
      image:
        filename: '/authors/admin/avatar.jpg'
      # cta:
      #   label: '**See Projects**'
      #   url: '/#projects'
      cta:
        label: Say hi in our community Discord
        url: https://discord.gg/yyBtW2Je3U
    design:
      background:
        gradient_end: '	#000080' #'#1976d2'
        gradient_start: '#000000' #'#004ba0'
        text_color_light: true
  - block: about.biography
    id: about
    content:
      title: Biography
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: admin
  - block: experience
    content:
      title: Experience
      # Date format for experience
      #   Refer to https://wowchemy.com/docs/customization/#date-format
      date_format: Jan 2006
      # Experiences.
      #   Add/remove as many `experience` items below as you like.
      #   Required fields are `title`, `company`, and `date_start`.
      #   Leave `date_end` empty if it's your current employer.
      #   Begin multi-line descriptions with YAML's `|2-` multi-line prefix.
      items:
        - title: Web Developer
          company: PT. Nokensoft Inovasi Teknologi Papua
          company_url: 'https://nokensoft.com'
          company_logo: org-x
          location: Jayapura, Indonesia
          date_start: '2023-01-12'
          date_end: ''
          description: Created tailwind templates for clients
        - title: Instructor & Contributor
          company: SaCode Community
          company_url: 'https://www.sacode.web.id'
          company_logo: org-gc
          location: Jayapura, Indonesia
          date_start: '2021-10-26'
          date_end: ''
          description: |2-
              Responsibilities include:

              * Developing a curriculum for intro to HTML-CSS and Python
              * Running a class of 15-20 people
              * Creating reports for the class and sponsors
              * Organizing a language documentation workshop
              * Running an AI think tank
        - title: Operations Student Assistant
          company: NSCL, Michigan State University
          company_url: ''
          company_logo: org-x
          location: East Lansing, Michigan
          date_start: '2018-08-12'
          date_end: '2019-07-31'
          description: Maintained parts for the main cyclotron and reports back.
    design:
      columns: '2'
  - block: collection
    id: posts
    content:
      title: Recent Posts
      subtitle: ''
      text: ''
      # Choose how many pages you would like to display (0 = all pages)
      count: 5
      # Filter on criteria
      filters:
        folders:
          - post
        author: ""
        category: ""
        tag: ""
        exclude_featured: false
        exclude_future: false
        exclude_past: false
        publication_type: ""
      # Choose how many pages you would like to offset by
      offset: 0
      # Page order: descending (desc) or ascending (asc) date.
      order: desc
    design:
      # Choose a layout view
      view: compact
      columns: '2'
  - block: portfolio
    id: projects
    content:
      title: Projects
      filters:
        folders:
          - project
      # Default filter index (e.g. 0 corresponds to the first `filter_button` instance below).
      default_button_index: 0
      # Filter toolbar (optional).
      # Add or remove as many filters (`filter_button` instances) as you like.
      # To show all items, set `tag` to "*".
      # To filter by a specific tag, set `tag` to an existing tag name.
      # To remove the toolbar, delete the entire `filter_button` block.
      buttons:
        - name: All
          tag: '*'
        - name: Deep Learning
          tag: Deep Learning
        - name: Other
          tag: Demo
    design:
      # Choose how many columns the section has. Valid values: '1' or '2'.
      columns: '1'
      view: showcase
      # For Showcase view, flip alternate rows?
      flip_alt_rows: false
  - block: collection
    id: talks
    content:
      title: SaCode
      filters:
        folders:
          - event
    design:
      columns: '2'
      view: compact
  # - block: features
  #   content:
  #     title: Featured
  #     items:
  #       - name: Python
  #         description: 80%
  #         icon: python
  #         icon_pack: fab
  #       - name: 
  #         description: 100%
  #         icon: chart-line
  #         icon_pack: fas
  #       - name: Photography
  #         description: 10%
  #         icon: camera-retro
  #         icon_pack: fas
  # - block: accomplishments
  #   content:
  #     # Note: `&shy;` is used to add a 'soft' hyphen in a long heading.
  #     title: 'Accomplish&shy;ments'
  #     subtitle:
  #     # Date format: https://wowchemy.com/docs/customization/#date-format
  #     date_format: Jan 2006
      # Accomplishments.
      #   Add/remove as many `item` blocks below as you like.
      #   `title`, `organization`, and `date_start` are the required parameters.
      #   Leave other parameters empty if not required.
      #   Begin multi-line descriptions with YAML's `|2-` multi-line prefix.
    #   items:
    #     - certificate_url: https://www.coursera.org
    #       date_end: ''
    #       date_start: '2021-01-25'
    #       description: ''
    #       organization: Coursera
    #       organization_url: https://www.coursera.org
    #       title: Neural Networks and Deep Learning
    #       url: ''
    #     - certificate_url: https://www.datacamp.com
    #       date_end: '2020-12-21'
    #       date_start: '2020-07-01'
    #       description: ''
    #       organization: DataCamp
    #       organization_url: https://www.datacamp.com
    #       title: 'Object-Oriented Programming in R'
    #       url: ''
    # design:
    #   columns: '2'
  # - block: markdown
  #   content:
  #     title: Gallery
  #     subtitle: ''
  #     text: |-
  #       {{<script type="text/javascript">
  #       (function(){
  #       var i,e,d=document,s="script";i=d.createElement("script");i.async=1;i.charset="UTF-8";
  #       i.src="https://cdn.curator.io/published/c05560e6-27f1-45bd-8aff-e219eb6e1d20.js";
  #       e=d.getElementsByTagName(s)[0];e.parentNode.insertBefore(i, e);
  #       })();
  #       </script>}}
  #   design:
  #     columns: '1'
  # - block: collection
  #   id: featured
  #   content:
  #     title: Featured Publications
  #     filters:
  #       folders:
  #         - publication
  #       featured_only: true
  #   design:dw
  #     columns: '2'
  #     view: card

  # - block: collection
  #   content:
  #     title: Recent Publications
  #     text: |-
  #       {{% callout note %}}
  #       Quickly discover relevant content by [filtering publications](./publication/).
  #       {{% /callout %}}
  #     filters:
  #       folders:
  #         - publication
  #       exclude_featured: true
  #   design:
  #     columns: '2'
  #     view: citation
  - block: tag_cloud
    content:
      title: Popular Topics
    design:
      columns: '2'
  - block: contact
    id: contact
    content:
      title: Contact
      subtitle:
      text: |-
        Email is always open. DM me on Twitter, Instagram, or Discord.
      # Contact (add or remove contact options as necessary)
      email: giyaibo@pm.me
      phone: +62 822 5095 8626
      # appointment_url: 'https://calendly.com'
      address:
        street: Jalan Raya Sentani Kelurahan Waena
        city: Jayapura
        region: Papua
        postcode: '94305'
        country: Indonesia
        country_code: ID
      # directions: Enter Building 1 and take the stairs to the second floor
      # office_hours:
      #   - 'Monday 10:00 to 13:00'
      #   - 'Wednesday 09:00 to 10:00'
      contact_links:
        - icon: instagram
          icon_pack: fab
          name: Instagram
          link: 'https://instagram.com/giyaibo'
        - icon: twitter
          icon_pack: fab
          name: X
          link: 'https://twitter.com/jind0sh'
      # Automatically link email and phone or display as text?
      autolink: true
      # Email form provider
      # form:
      #   provider: netlify
      #   formspree:
      #     id:
      #   netlify:
      #     # Enable CAPTCHA challenge to reduce spam?
      #     captcha: false
    design:
      columns: '2'
---
